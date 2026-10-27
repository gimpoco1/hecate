import Capacitor
import UIKit

@objc(AppIconPlugin)
class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AppIconPlugin"
    let jsName = "AppIcon"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise)
    ]

    @objc func getState(_ call: CAPPluginCall) {
        Task { @MainActor in resolveState(call) }
    }

    @objc func setIcon(_ call: CAPPluginCall) {
        guard let icon = call.getString("icon"), icon == "original" || icon == "dark" else {
            call.reject("App icon must be original or dark.")
            return
        }
        Task { @MainActor in
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Changing the app icon is not supported on this device.")
                return
            }
            guard UIApplication.shared.applicationState == .active else {
                call.reject("Open Hecate before changing the app icon.")
                return
            }
            let name: String? = icon == "dark" ? "AppIconDark" : nil
            do {
                if UIApplication.shared.alternateIconName != name {
                    try await UIApplication.shared.setAlternateIconName(name)
                }
                resolveState(call)
            } catch {
                call.reject("iOS could not change the Hecate app icon. Try again while Hecate is open.", nil, error)
            }
        }
    }

    @MainActor private func resolveState(_ call: CAPPluginCall) {
        let name = UIApplication.shared.alternateIconName
        guard name == nil || name == "AppIconDark" else {
            call.reject("iOS returned an unrecognized Hecate app icon.")
            return
        }
        call.resolve(["supported": UIApplication.shared.supportsAlternateIcons,
                      "icon": name == "AppIconDark" ? "dark" : "original"])
    }
}
