import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pluginPath = fileURLToPath(new URL('../node_modules/@capacitor-community/background-geolocation/ios/Plugin/Swift/Plugin.swift', import.meta.url))
const original = 'manager.showsBackgroundLocationIndicator = background'
const replacement = 'manager.showsBackgroundLocationIndicator = call.getBool("showsBackgroundLocationIndicator") ?? background'
const source = readFileSync(pluginPath, 'utf8')

if (source.includes(replacement)) {
  process.exit(0)
}
if (!source.includes(original)) {
  throw new Error('Background geolocation plugin changed; review the iOS indicator patch before building.')
}
writeFileSync(pluginPath, source.replace(original, replacement))
