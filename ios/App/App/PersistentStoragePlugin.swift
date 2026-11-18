import Capacitor
import Foundation

@objc(PersistentStoragePlugin)
class PersistentStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PersistentStoragePlugin"
    let jsName = "PersistentStorage"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise)
    ]

    private func entry(_ call: CAPPluginCall) throws -> URL {
        guard let key = call.getString("key"), !key.isEmpty, key.utf8.count <= 180 else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = support.appendingPathComponent("PersistentStorage", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var privateDirectory = directory
        var resources = URLResourceValues()
        resources.isExcludedFromBackup = true
        try privateDirectory.setResourceValues(resources)
        return directory.appendingPathComponent(Data(key.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_"))
    }

    @objc func read(_ call: CAPPluginCall) {
        do {
            let url = try entry(call)
            let value = try String(contentsOf: url, encoding: .utf8)
            call.resolve(["value": value])
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            call.resolve(["value": NSNull()])
        } catch {
            call.reject("Could not read Hecate's private storage.", nil, error)
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        do {
            let url = try entry(call)
            if let value = call.getString("value") {
                let staging = url.appendingPathExtension("new")
                try Data(value.utf8).write(to: staging, options: .completeFileProtectionUntilFirstUserAuthentication)
                let handle = try FileHandle(forWritingTo: staging)
                do {
                    try handle.synchronize()
                } catch {
                    try handle.close()
                    throw error
                }
                try handle.close()
                guard rename(staging.path, url.path) == 0 else {
                    throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                }
            } else if call.options["value"] is NSNull {
                do {
                    try FileManager.default.removeItem(at: url)
                } catch let error as CocoaError where error.code == .fileNoSuchFile {
                    // Deleting an absent entry is already complete.
                }
            } else {
                throw CocoaError(.fileWriteInapplicableStringEncoding)
            }
            call.resolve()
        } catch {
            call.reject("Could not update Hecate's private storage.", nil, error)
        }
    }
}
