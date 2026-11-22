import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "hecate-journey-timing-"));
try {
  const shared = readFileSync(new URL("../ios/App/Shared/JourneyActivityAttributes.swift", import.meta.url), "utf8");
  const enums = shared.slice(shared.indexOf("enum JourneyTurnSymbol"), shared.indexOf("@available(iOS 16.2"));
  const state = shared.slice(shared.indexOf("    struct ContentState:"), shared.indexOf("\n    let walkId:"));
  writeFileSync(join(directory, "main.swift"), `import Foundation
${enums}
struct JourneyActivityAttributes {
${state}
}
let start = Date(timeIntervalSince1970: 1000)
let pausedAt = start.addingTimeInterval(600)
let end = pausedAt.addingTimeInterval(300)
let paused = JourneyActivityAttributes.ContentState(distanceKm: 1, newGroundMeters: 10, paused: true,
    activeStartedAt: start, updatedAt: pausedAt, finishedAt: nil)
let pausedEnd = paused.ending(at: end)
precondition(pausedEnd.finishedAt!.timeIntervalSince(pausedEnd.activeStartedAt) == 600, "Ending must exclude the current pause")
var active = paused
active.paused = false
let activeEnd = active.ending(at: end)
precondition(activeEnd.finishedAt!.timeIntervalSince(activeEnd.activeStartedAt) == 900, "An active timer continues until End")
precondition(paused.finishedAt == nil && paused.activeStartedAt == start, "Ending must not mutate its input")
print("iOS journey timing: 3 cases passed")
`);
  const executable = join(directory, "journey-timing");
  execFileSync("swiftc", ["-module-cache-path", join(directory, "swift-cache"), join(directory, "main.swift"), "-o", executable], { stdio: "inherit" });
  execFileSync(executable, [], { stdio: "inherit" });
  const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"], { encoding: "utf8" }).trim();
  writeFileSync(join(directory, "JourneyTimingTest.java"), `package com.gimpoco.hecate;
import java.util.Locale;
public class JourneyTimingTest {
  public static void main(String[] args) {
    JourneyState paused = new JourneyState("walk", "owner", 1000, 1, 10.0, null, true, 600000, 601000);
    if (!paused.finish(901000).elapsedLabel(Locale.US).equals("10:00")) throw new AssertionError("Ending must exclude the current pause");
    JourneyState resumed = new JourneyState("walk", "owner", 1000, 1, 10.0, null, false, 600000, 901000);
    if (!resumed.finish(961000).elapsedLabel(Locale.US).equals("11:00")) throw new AssertionError("Resume must exclude earlier pauses");
    if (paused.finishedAt() != null) throw new AssertionError("Ending must not mutate its input");
    System.out.println("Android journey timing: 3 cases passed");
  }
}`);
  execFileSync(join(javaHome, "bin/javac"), ["-d", directory,
    new URL("../android/app/src/main/java/com/gimpoco/hecate/JourneyState.java", import.meta.url).pathname,
    join(directory, "JourneyTimingTest.java")], { stdio: "inherit" });
  execFileSync(join(javaHome, "bin/java"), ["-cp", directory, "com.gimpoco.hecate.JourneyTimingTest"], { stdio: "inherit" });
} finally { rmSync(directory, { recursive: true, force: true }); }
