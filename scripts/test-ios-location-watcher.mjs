import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "hecate-location-watcher-"));
try {
  const source = readFileSync(new URL("../node_modules/@capacitor-community/background-geolocation/ios/Plugin/Swift/Plugin.swift", import.meta.url), "utf8");
  const watcher = source.slice(source.indexOf("class Watcher:"), source.indexOf("@objc(BackgroundGeolocation)"));
  const main = join(directory, "main.swift");
  const executable = join(directory, "location-watcher-tests");
  writeFileSync(main, `import Foundation
import CoreLocation
${watcher}
func fix(_ timestamp: Date) -> CLLocation {
    return CLLocation(coordinate: CLLocationCoordinate2D(latitude: 41, longitude: 2), altitude: 0,
                      horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: timestamp)
}
let old = fix(Date.distantPast)
let fresh = fix(Date.distantFuture)
let strict = Watcher("strict", stale: false)
let permissive = Watcher("permissive", stale: true)
precondition(!strict.isLocationValid(old), "Reject locations older than watcher creation")
precondition(strict.isLocationValid(fresh), "Accept locations after watcher creation")
precondition(permissive.isLocationValid(old), "Preserve explicitly allowed stale locations")
precondition(permissive.isLocationValid(fresh), "Accept fresh locations when stale locations are allowed")
print("iOS location watcher: 4 cases passed")
`);
  execFileSync("swiftc", ["-module-cache-path", join(directory, "cache"), main, "-o", executable], { stdio: "inherit" });
  execFileSync(executable, [], { stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
