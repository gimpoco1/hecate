import ActivityKit
import AppIntents
import Foundation

@available(iOS 16.2, *)
struct JourneyActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let distanceKm: Double
        let newGroundMeters: Double?
        let updatedAt: Date
        let finishedAt: Date?
    }

    let walkId: String
    let ownerId: String
    let startedAt: Date
}

struct JourneyStopRequest: Codable {
    let walkId: String
    let ownerId: String
    let finishedAt: Double
}

enum JourneyStopStore {
    static let notification = Notification.Name("HecateJourneyStopRequested")

    static func read(walkId: String) throws -> JourneyStopRequest? {
        guard let data = UserDefaults.standard.data(forKey: "hecate.journey.stop." + walkId) else { return nil }
        let request = try JSONDecoder().decode(JourneyStopRequest.self, from: data)
        guard request.walkId == walkId, !request.ownerId.isEmpty,
              request.finishedAt.isFinite, request.finishedAt > 0 else {
            throw JourneyStopError.invalidStoredRequest
        }
        return request
    }

    static func save(_ request: JourneyStopRequest) throws {
        UserDefaults.standard.set(try JSONEncoder().encode(request), forKey: "hecate.journey.stop." + request.walkId)
    }

    static func remove(walkId: String) {
        UserDefaults.standard.removeObject(forKey: "hecate.journey.stop." + walkId)
    }
}

enum JourneyStopError: LocalizedError {
    case invalidStoredRequest

    var errorDescription: String? {
        "The saved Lock Screen stop request contains invalid journey details."
    }
}

@available(iOS 17.0, *)
struct StopJourneyIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop journey"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    @Parameter(title: "Journey ID") var walkId: String

    init() {}

    init(walkId: String) {
        self.walkId = walkId
    }

    func perform() async throws -> some IntentResult {
        guard let activity = Activity<JourneyActivityAttributes>.activities.first(where: {
            $0.attributes.walkId == walkId && $0.content.state.finishedAt == nil &&
                ($0.activityState == .active || $0.activityState == .stale)
        }) else { return .result() }
        let request = try await MainActor.run {
            let request = try JourneyStopStore.read(walkId: walkId) ?? JourneyStopRequest(
                walkId: walkId, ownerId: activity.attributes.ownerId,
                finishedAt: Date().timeIntervalSince1970 * 1000
            )
            // Persist before stopping GPS so a suspended or reloaded WebView can finish saving the walk later.
            try JourneyStopStore.save(request)
            NotificationCenter.default.post(name: JourneyStopStore.notification, object: request,
                                            userInfo: ["walkId": walkId])
            return request
        }
        let finishedAt = Date(timeIntervalSince1970: request.finishedAt / 1000)
        let state = activity.content.state
        await activity.end(
            ActivityContent(state: JourneyActivityAttributes.ContentState(
                distanceKm: state.distanceKm, newGroundMeters: state.newGroundMeters,
                updatedAt: finishedAt, finishedAt: finishedAt
            ), staleDate: nil),
            dismissalPolicy: .after(finishedAt.addingTimeInterval(5))
        )
        return .result()
    }
}
