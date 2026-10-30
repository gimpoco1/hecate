import AuthenticationServices
import Capacitor
import UIKit

@objc(GoogleSignInPlugin)
class GoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    let identifier = "GoogleSignInPlugin"
    let jsName = "GoogleSignIn"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)]
    private let callbackScheme = "com.gimpoco.hecate.auth"
    private var pendingCall: CAPPluginCall?
    private var session: ASWebAuthenticationSession?
    private var presentationWindow: UIWindow?

    @objc func signIn(_ call: CAPPluginCall) {
        Task { @MainActor in beginSignIn(call) }
    }

    @MainActor private func beginSignIn(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Google sign-in is already in progress.", "SIGN_IN_IN_PROGRESS")
            return
        }
        guard let window = bridge?.viewController?.view.window,
              UIApplication.shared.applicationState == .active else {
            call.reject("Open Hecate before signing in with Google.", "APP_NOT_ACTIVE")
            return
        }
        guard let rawURL = call.getString("url"), let url = URL(string: rawURL),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "https", components.host == "myqsbtpfertaltyzaoyk.supabase.co",
              components.path == "/auth/v1/authorize", components.port == nil,
              components.user == nil, components.password == nil, components.fragment == nil,
              components.queryItems?.first(where: { $0.name == "provider" })?.value == "google",
              components.queryItems?.first(where: { $0.name == "redirect_to" })?.value == "\(callbackScheme)://callback" else {
            call.reject("Google sign-in requires Hecate's configured authorization URL.", "INVALID_AUTH_URL")
            return
        }
        let authentication = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
            Task { @MainActor in self?.completeSignIn(callbackURL: callbackURL, error: error) }
        }
        pendingCall = call
        presentationWindow = window
        session = authentication
        authentication.presentationContextProvider = self
        authentication.prefersEphemeralWebBrowserSession = false
        if !authentication.start() {
            clearRequest()
            call.reject("The Google authentication session could not start. Please try again.", "AUTH_SESSION_START_FAILED")
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let window = presentationWindow else {
            preconditionFailure("Google sign-in requires its captured presentation window.")
        }
        return window
    }

    @MainActor private func completeSignIn(callbackURL: URL?, error: Error?) {
        guard let call = pendingCall else { return }
        defer { clearRequest() }
        if let error = error {
            if let authenticationError = error as? ASWebAuthenticationSessionError, authenticationError.code == .canceledLogin {
                call.reject("Sign-in cancelled.", "SIGN_IN_CANCELLED")
            } else {
                call.reject("Google authentication could not be completed. Please try again.", "GOOGLE_SIGN_IN_FAILED", error)
            }
            return
        }
        switch validateGoogleAuthCallback(callbackURL) {
        case .success(let url): call.resolve(["callbackURL": url.absoluteString])
        case .failure(let error): call.reject(error.message, error.rawValue)
        }
    }

    private func clearRequest() {
        pendingCall = nil
        session = nil
        presentationWindow = nil
    }
}
