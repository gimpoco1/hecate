import Foundation

enum GoogleAuthCallbackError: String, Error {
    case missingURL = "GOOGLE_CALLBACK_MISSING"
    case unexpectedTarget = "GOOGLE_CALLBACK_TARGET"
    case unexpectedFragment = "GOOGLE_CALLBACK_FRAGMENT"
    case oversizedURL = "GOOGLE_CALLBACK_TOO_LONG"

    var message: String {
        switch self {
        case .missingURL: return "Google sign-in completed without a callback URL. Please start sign-in again."
        case .unexpectedTarget: return "Google returned a callback with an unexpected address. Please start sign-in again."
        case .unexpectedFragment: return "Google returned a callback containing an unsupported fragment. Please start sign-in again."
        case .oversizedURL: return "Google returned a callback exceeding the sign-in size limit. Please start sign-in again."
        }
    }
}

/** Foundation distinguishes an absent fragment from an empty '#'; neither carries credentials. */
func validateGoogleAuthCallback(_ callbackURL: URL?) -> Result<URL, GoogleAuthCallbackError> {
    guard let url = callbackURL else { return .failure(.missingURL) }
    guard url.absoluteString.count <= 5000 else { return .failure(.oversizedURL) }
    guard url.scheme == "com.gimpoco.hecate.auth", url.host == "callback",
          url.path.isEmpty || url.path == "/", url.user == nil, url.password == nil, url.port == nil else {
        return .failure(.unexpectedTarget)
    }
    guard url.fragment?.isEmpty != false else { return .failure(.unexpectedFragment) }
    return .success(url)
}
