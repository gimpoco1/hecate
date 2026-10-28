import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'hecate-reminder-motion-'))
try {
  const source = readFileSync(new URL('./ios-reminder-motion.swift', import.meta.url), 'utf8')
  const decision = source.split('final class MotionReminderWatcher:')[0]
  const tests = `
let walking = ReminderMotionState(stationary: false, walking: true, running: false, automotive: false, cycling: false)
let running = ReminderMotionState(stationary: false, walking: false, running: true, automotive: false, cycling: false)
let stopped = ReminderMotionState(stationary: true, walking: false, running: false, automotive: false, cycling: false)
let unknown = ReminderMotionState(stationary: false, walking: false, running: false, automotive: false, cycling: false)
let stoppedWithWalkingFlag = ReminderMotionState(stationary: true, walking: true, running: false, automotive: false, cycling: false)
let vehicleWithWalkingFlag = ReminderMotionState(stationary: false, walking: true, running: false, automotive: true, cycling: false)
let cyclingWithWalkingFlag = ReminderMotionState(stationary: false, walking: true, running: false, automotive: false, cycling: true)
precondition(shouldTrackReminderMotion(walking), "Walking must enable reminder GPS")
precondition(shouldTrackReminderMotion(running), "Running must enable reminder GPS")
precondition(!shouldTrackReminderMotion(stopped), "Stationary activity must stop GPS")
precondition(!shouldTrackReminderMotion(unknown), "Unknown activity must not start GPS")
precondition(!shouldTrackReminderMotion(stoppedWithWalkingFlag), "Stationary must override overlapping walking data")
precondition(!shouldTrackReminderMotion(vehicleWithWalkingFlag), "Vehicles must not enable walking-reminder GPS")
precondition(!shouldTrackReminderMotion(cyclingWithWalkingFlag), "Cycling must not enable walking-reminder GPS")
print("iOS reminder motion gate: 7 cases passed")
`
  const main = join(directory, 'main.swift')
  const executable = join(directory, 'reminder-motion-tests')
  writeFileSync(main, decision + tests)
  execFileSync('swiftc', ['-module-cache-path', join(directory, 'cache'), main, '-o', executable], { stdio: 'inherit' })
  execFileSync(executable, [], { stdio: 'inherit' })
} finally {
  rmSync(directory, { recursive: true, force: true })
}
