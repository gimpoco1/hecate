import AppIntents
import Foundation

struct JourneyControlRequest: Codable {
    let id: String
    let requestedAt: Double
}

enum JourneyControlStore {
    static let notification = Notification.Name("HecateJourneyControlRequested")
    private static let key = "hecate.journey.control-request"

    static func read(defaults: UserDefaults) throws -> JourneyControlRequest? {
        guard let data = defaults.data(forKey: key) else { return nil }
        let request = try JSONDecoder().decode(JourneyControlRequest.self, from: data)
        guard UUID(uuidString: request.id) != nil, request.requestedAt.isFinite, request.requestedAt > 0 else {
            throw JourneyControlError.invalidRequest
        }
        return request
    }

    static func save(_ request: JourneyControlRequest, defaults: UserDefaults) throws {
        defaults.set(try JSONEncoder().encode(request), forKey: key)
    }

    static func acknowledge(id: String, defaults: UserDefaults) throws {
        if try read(defaults: defaults)?.id == id { defaults.removeObject(forKey: key) }
    }
}

enum JourneyControlError: LocalizedError {
    case invalidRequest
    var errorDescription: String? { "The saved journey control request is invalid. Open Hecate and try the control again." }
}

@available(iOS 18.0, *)
enum JourneyControlDestination: String, AppEnum {
    case journey
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Hecate destination")
    static var caseDisplayRepresentations: [JourneyControlDestination: DisplayRepresentation] = [.journey: "Journey"]
}

/// OpenIntent runs in the app target so the request and the Capacitor bridge share the same store.
@available(iOS 18.0, *)
struct JourneyControlIntent: OpenIntent {
    static var title: LocalizedStringResource = "Start or stop a Hecate journey"
    @Parameter(title: "Destination") var target: JourneyControlDestination

    init() { target = .journey }

    func perform() async throws -> some IntentResult {
        try await MainActor.run {
            let request = JourneyControlRequest(id: UUID().uuidString, requestedAt: Date().timeIntervalSince1970 * 1000)
            try JourneyControlStore.save(request, defaults: .standard)
            NotificationCenter.default.post(name: JourneyControlStore.notification, object: request)
        }
        return .result()
    }
}
