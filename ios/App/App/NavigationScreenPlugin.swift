import Capacitor
import UIKit

@objc(NavigationScreenPlugin)
class NavigationScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NavigationScreenPlugin"
    let jsName = "NavigationScreen"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "allowSleep", returnType: CAPPluginReturnPromise)
    ]

    private var navigationActive = false
    private var applicationActive = false

    override func load() {
        applicationActive = UIApplication.shared.applicationState == .active
        NotificationCenter.default.addObserver(self, selector: #selector(applicationWillResignActive),
                                               name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(applicationDidBecomeActive),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    private func updateIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = navigationActive && applicationActive
            && UIApplication.shared.applicationState == .active
    }

    @objc private func applicationWillResignActive() {
        applicationActive = false
        updateIdleTimer()
    }

    @objc private func applicationDidBecomeActive() {
        applicationActive = true
        updateIdleTimer()
    }

    @objc func keepAwake(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.navigationActive = true
            self.updateIdleTimer()
            call.resolve()
        }
    }

    @objc func allowSleep(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.navigationActive = false
            self.updateIdleTimer()
            call.resolve()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
}
