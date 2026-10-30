import AuthenticationServices
import Capacitor
import CryptoKit
import Security
import UIKit

@objc(AppleSignInPlugin)
class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    let identifier = "AppleSignInPlugin"
    let jsName = "AppleSignIn"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "credentialState", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?
    private var presentationWindow: UIWindow?
    private var nonce: String?
    private var requestState: String?
    private var revocationObserver: NSObjectProtocol?

    override func load() {
        revocationObserver = NotificationCenter.default.addObserver(
            forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("credentialRevoked", data: [:])
        }
    }

    deinit {
        if let observer = revocationObserver { NotificationCenter.default.removeObserver(observer) }
    }

    @objc func credentialState(_ call: CAPPluginCall) {
        guard let userID = call.getString("userID"), !userID.isEmpty else {
            call.reject("An Apple user identifier is required to check sign-in access.", "APPLE_USER_REQUIRED")
            return
        }
        ASAuthorizationAppleIDProvider().getCredentialState(forUserID: userID) { state, error in
            if let error = error {
                call.reject("Apple sign-in access could not be checked. Please try again.", "APPLE_STATE_FAILED", error)
                return
            }
            switch state {
            case .authorized: call.resolve(["state": "authorized"])
            case .revoked, .notFound: call.resolve(["state": "revoked"])
            case .transferred: call.reject("This Apple account requires an app transfer update. Contact Hecate support.", "APPLE_ACCOUNT_TRANSFERRED")
            @unknown default: call.reject("Apple returned an unsupported account state.", "APPLE_STATE_UNSUPPORTED")
            }
        }
    }

    @objc func signIn(_ call: CAPPluginCall) {
        Task { @MainActor in beginSignIn(call) }
    }

    @MainActor private func beginSignIn(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Apple sign-in is already in progress.", "SIGN_IN_IN_PROGRESS")
            return
        }
        guard let window = bridge?.viewController?.view.window,
              UIApplication.shared.applicationState == .active else {
            call.reject("Open Hecate before signing in with Apple.", "APP_NOT_ACTIVE")
            return
        }
        var randomBytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes) == errSecSuccess else {
            call.reject("A secure Apple sign-in request could not be created. Try again.", "NONCE_GENERATION_FAILED")
            return
        }
        let rawNonce = Data(randomBytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let state = UUID().uuidString
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(rawNonce.utf8)).map { String(format: "%02x", $0) }.joined()
        request.state = state
        pendingCall = call
        nonce = rawNonce
        requestState = state
        presentationWindow = window
        let authorization = ASAuthorizationController(authorizationRequests: [request])
        authorization.delegate = self
        authorization.presentationContextProvider = self
        controller = authorization
        authorization.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        guard let window = presentationWindow else {
            preconditionFailure("Apple sign-in requires its captured presentation window.")
        }
        return window
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        defer { clearRequest() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == requestState,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8), !token.isEmpty,
              let rawNonce = nonce else {
            call.reject("Apple returned an incomplete or mismatched sign-in response. Try again.", "INVALID_APPLE_RESPONSE")
            return
        }
        var response: JSObject = ["identityToken": token, "nonce": rawNonce]
        if let name = credential.fullName {
            let fullName = PersonNameComponentsFormatter().string(from: name).trimmingCharacters(in: .whitespacesAndNewlines)
            if !fullName.isEmpty { response["fullName"] = fullName }
        }
        call.resolve(response)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        defer { clearRequest() }
        if let authorizationError = error as? ASAuthorizationError, authorizationError.code == .canceled {
            call.reject("Sign-in cancelled.", "SIGN_IN_CANCELLED")
        } else {
            call.reject("Apple could not sign you in. Please try again.", "APPLE_SIGN_IN_FAILED", error)
        }
    }

    private func clearRequest() {
        pendingCall = nil
        controller = nil
        presentationWindow = nil
        nonce = nil
        requestState = nil
    }
}
