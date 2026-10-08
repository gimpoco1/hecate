import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDirectory = fileURLToPath(new URL('../', import.meta.url))
const androidDirectory = path.join(rootDirectory, 'android')
const buildFile = path.join(androidDirectory, 'app', 'build.gradle')
const keystoreFile = path.join(androidDirectory, 'keystores', 'hecate-upload.jks')
const bundleFile = path.join(androidDirectory, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
const releaseDirectory = path.join(androidDirectory, 'app', 'release')
const keyAlias = 'hecate-upload'

function singleMatch(source, expression, label) {
  const matches = [...source.matchAll(expression)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in ${buildFile}, found ${matches.length}.`)
  }
  return matches[0]
}

function nextAndroidVersion(source) {
  const codeMatch = singleMatch(source, /^\s*versionCode\s+(\d+)\s*$/gm, 'versionCode')
  const nameMatch = singleMatch(
    source,
    /^\s*versionName\s+"(\d+)\.(\d+)\.(\d+)"\s*$/gm,
    'versionName',
  )
  const versionCode = Number(codeMatch[1]) + 1
  const versionName = `${nameMatch[1]}.${nameMatch[2]}.${Number(nameMatch[3]) + 1}`
  return { versionCode, versionName }
}

function updatedBuildFile(source, version) {
  return source
    .replace(/^(\s*versionCode\s+)\d+(\s*)$/m, `$1${version.versionCode}$2`)
    .replace(
      /^(\s*versionName\s+)"\d+\.\d+\.\d+"(\s*)$/m,
      `$1"${version.versionName}"$2`,
    )
}

function run(command, args, workingDirectory, environment) {
  const result = spawnSync(command, args, {
    cwd: workingDirectory,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`)
  }
}

function capture(command, args, workingDirectory, environment) {
  try {
    return execFileSync(command, args, {
      cwd: workingDirectory,
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stdout = error.stdout?.toString().trim() ?? ''
    const stderr = error.stderr?.toString().trim() ?? ''
    throw new Error(
      `${command} failed.\n${stdout}\n${stderr}`.trim(),
      { cause: error },
    )
  }
}

function keychainPassword(account) {
  const password = capture(
    'security',
    ['find-generic-password', '-a', account, '-w'],
    rootDirectory,
    process.env,
  )
  if (password.length === 0) {
    throw new Error(`The macOS Keychain entry ${account} has an empty password.`)
  }
  return password
}

function sha256Fingerprint(output, source) {
  const match = /SHA256:\s*([0-9A-F:]+)/i.exec(output)
  if (!match) {
    throw new Error(`Could not read the SHA-256 signing fingerprint from ${source}.`)
  }
  return match[1].toUpperCase()
}

async function sha256(file) {
  const contents = await readFile(file)
  return createHash('sha256').update(contents).digest('hex')
}

if (process.platform !== 'darwin') {
  throw new Error('Signed Android releases require macOS because the signing passwords are stored in Keychain.')
}

await access(keystoreFile)
const originalBuildSource = await readFile(buildFile, 'utf8')
const version = nextAndroidVersion(originalBuildSource)
const artifactFile = path.join(
  releaseDirectory,
  `hecate-${version.versionName}-build-${version.versionCode}.aab`,
)

try {
  await access(artifactFile)
  throw new Error(`Release artifact already exists: ${artifactFile}`)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const storeAccount = `KEY_STORE_PASSWORD__${keystoreFile}`
const keyAccount = `KEY_PASSWORD__${keystoreFile}__${keyAlias}`
const storePassword = keychainPassword(storeAccount)
const keyPassword = keychainPassword(keyAccount)
const signingEnvironment = {
  ...process.env,
  'ORG_GRADLE_PROJECT_android.injected.signing.store.file': keystoreFile,
  'ORG_GRADLE_PROJECT_android.injected.signing.store.password': storePassword,
  'ORG_GRADLE_PROJECT_android.injected.signing.key.alias': keyAlias,
  'ORG_GRADLE_PROJECT_android.injected.signing.key.password': keyPassword,
  HECATE_ANDROID_KEYSTORE_PASSWORD: storePassword,
}

await writeFile(buildFile, updatedBuildFile(originalBuildSource, version))

try {
  run('npm', ['test'], rootDirectory, process.env)
  run('npm', ['run', 'build'], rootDirectory, process.env)
  run('npx', ['cap', 'sync', 'android'], rootDirectory, process.env)
  run('./gradlew', ['bundleRelease'], androidDirectory, signingEnvironment)

  const verification = capture('jarsigner', ['-verify', bundleFile], rootDirectory, process.env)
  if (!verification.includes('jar verified.')) {
    throw new Error(`The generated Android App Bundle did not pass signature verification: ${bundleFile}`)
  }

  const keystoreCertificate = capture(
    'keytool',
    ['-list', '-v', '-keystore', keystoreFile, '-alias', keyAlias, '-storepass:env', 'HECATE_ANDROID_KEYSTORE_PASSWORD'],
    rootDirectory,
    signingEnvironment,
  )
  const bundleCertificate = capture(
    'keytool',
    ['-printcert', '-jarfile', bundleFile],
    rootDirectory,
    process.env,
  )
  const expectedFingerprint = sha256Fingerprint(keystoreCertificate, keystoreFile)
  const actualFingerprint = sha256Fingerprint(bundleCertificate, bundleFile)
  if (actualFingerprint !== expectedFingerprint) {
    throw new Error(
      `Signing certificate mismatch for ${bundleFile}. Expected ${expectedFingerprint}, received ${actualFingerprint}.`,
    )
  }

  await mkdir(releaseDirectory, { recursive: true })
  await copyFile(bundleFile, artifactFile)
  const artifactStats = await stat(artifactFile)
  const artifactHash = await sha256(artifactFile)

  console.log('\nSigned Android release created successfully.')
  console.log(`Version: ${version.versionName} (${version.versionCode})`)
  console.log(`Artifact: ${artifactFile}`)
  console.log(`Size: ${artifactStats.size} bytes`)
  console.log(`SHA-256: ${artifactHash}`)
} catch (error) {
  await writeFile(buildFile, originalBuildSource)
  throw error
}
