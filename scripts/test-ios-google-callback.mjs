import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "hecate-google-callback-"));
try {
  const source = readFileSync(new URL("../ios/App/App/GoogleAuthCallback.swift", import.meta.url), "utf8");
  const tests = `
let validCallbacks = [
    "com.gimpoco.hecate.auth://callback?code=test-code",
    "com.gimpoco.hecate.auth://callback/?code=test-code",
    "com.gimpoco.hecate.auth://callback?code=test-code#",
    "com.gimpoco.hecate.auth://callback/?code=test-code#"
]
for value in validCallbacks {
    let result = validateGoogleAuthCallback(URL(string: value))
    guard case .success(let callback) = result else {
        fatalError("Valid root callback was rejected: \\(value)")
    }
    precondition(callback.absoluteString == value, "Validation must preserve the callback code")
}
let invalidCallbacks: [(URL?, GoogleAuthCallbackError)] = [
    (nil, .missingURL),
    (URL(string: "https://callback?code=test"), .unexpectedTarget),
    (URL(string: "com.gimpoco.hecate.auth://other?code=test"), .unexpectedTarget),
    (URL(string: "com.gimpoco.hecate.auth://callback/other?code=test"), .unexpectedTarget),
    (URL(string: "com.gimpoco.hecate.auth://user@callback?code=test"), .unexpectedTarget),
    (URL(string: "com.gimpoco.hecate.auth://callback:123?code=test"), .unexpectedTarget),
    (URL(string: "com.gimpoco.hecate.auth://callback?code=test#access_token=bad"), .unexpectedFragment),
    (URL(string: "com.gimpoco.hecate.auth://callback/?code=test#refresh_token=bad"), .unexpectedFragment),
    (URL(string: "com.gimpoco.hecate.auth://callback?code=" + String(repeating: "x", count: 5000)), .oversizedURL)
]
for (url, expected) in invalidCallbacks {
    guard case .failure(let failure) = validateGoogleAuthCallback(url) else {
        fatalError("Invalid callback was accepted")
    }
    precondition(failure == expected, "Callback must identify the failed validation boundary")
}
print("iOS Google callback: 13 Foundation URL cases passed")
`;
  const main = join(directory, "main.swift");
  const executable = join(directory, "google-callback-tests");
  writeFileSync(main, source + tests);
  execFileSync("swiftc", ["-module-cache-path", join(directory, "cache"), main, "-o", executable], { stdio: "inherit" });
  execFileSync(executable, [], { stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
