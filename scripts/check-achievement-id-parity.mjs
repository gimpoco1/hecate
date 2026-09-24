import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const sources = [
  'supabase.sql',
  'scripts/install-leaderboard-achievements.sql',
]

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8')
}

function quotedValues(source) {
  return [...source.matchAll(/["']([a-z0-9-]+)["']/g)].map((match) => match[1])
}

function canonicalAchievementIds() {
  const source = read('src/achievements.ts')
  const match = source.match(
    /export const PERSONAL_ACHIEVEMENT_IDS = \[([\s\S]*?)\] as const;/,
  )
  if (!match) throw new Error('Could not find PERSONAL_ACHIEVEMENT_IDS in src/achievements.ts')
  return quotedValues(match[1])
}

function sqlAchievementIds(relativePath) {
  const source = read(relativePath)
  const match = source.match(
    /-- BEGIN PERSONAL_ACHIEVEMENT_IDS([\s\S]*?)-- END PERSONAL_ACHIEVEMENT_IDS/,
  )
  if (!match) throw new Error(`Could not find the achievement ID markers in ${relativePath}`)
  return quotedValues(match[1])
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const canonical = canonicalAchievementIds()
const failures = sources.flatMap((relativePath) => {
  const actual = sqlAchievementIds(relativePath)
  return sameValues(actual, canonical)
    ? []
    : [`${relativePath}\n  expected: ${canonical.join(', ')}\n  received: ${actual.join(', ')}`]
})

if (failures.length) {
  throw new Error(
    `Leaderboard achievement ID allow-lists are out of sync with src/achievements.ts:\n${failures.join('\n')}`,
  )
}

console.log(`Achievement ID parity verified across ${sources.length + 1} sources (${canonical.length} IDs).`)
