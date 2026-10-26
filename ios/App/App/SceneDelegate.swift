import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var pendingShortcut: UIApplicationShortcutItem?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        pendingShortcut = connectionOptions.shortcutItem
        if let context = connectionOptions.urlContexts.first {
            open(context)
        } else if let activity = connectionOptions.userActivities.first {
            continueActivity(activity)
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        guard let shortcut = pendingShortcut else { return }
        pendingShortcut = nil
        handleShortcut(shortcut, completionHandler: { _ in })
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        handleShortcut(shortcutItem, completionHandler: completionHandler)
    }

    private func handleShortcut(_ shortcut: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        if shortcut.type == "com.gimpoco.hecate.feedback" {
            guard let url = URL(string: "hecate://feedback") else {
                preconditionFailure("Invalid Hecate feedback URL")
            }
            completionHandler(ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:]))
            return
        }
        guard shortcut.type == "com.gimpoco.hecate.leave-review" else {
            completionHandler(false)
            return
        }
        guard let url = URL(string: "https://apps.apple.com/app/id6811544963?action=write-review") else {
            preconditionFailure("Invalid Hecate App Store review URL")
        }
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            if !opened {
                let alert = UIAlertController(title: "Couldn’t open the App Store", message: "Open the App Store and search for Hecate to leave a review.", preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                self?.window?.rootViewController?.present(alert, animated: true)
            }
            completionHandler(opened)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            open(context)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continueActivity(userActivity)
    }

    private func open(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [
            .openInPlace: context.options.openInPlace
        ]
        if let sourceApplication = context.options.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    private func continueActivity(_ activity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
}
