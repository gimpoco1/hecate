import ActivityKit
import Capacitor
import Foundation
import UIKit

@objc(JourneyActivityPlugin)
class JourneyActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "JourneyActivityPlugin"
    let jsName = "JourneyActivity"
    private var appearance: JourneyAppearance = .system
    private var colorTheme: JourneyColorTheme = .light
    private var language: String? = nil
    @MainActor private var activityQueue: Task<Void, Never>?
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStopRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPauseRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgePause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pauseLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reconcile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getControlRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeControlRequest", returnType: CAPPluginReturnPromise)
    ]

    override func load() {
        if #available(iOS 16.2, *), let state = Activity<JourneyActivityAttributes>.activities.first?.content.state {
            appearance = state.appearance ?? .system
            colorTheme = state.colorTheme ?? .light
            language = state.language
        }
        NotificationCenter.default.addObserver(self, selector: #selector(journeyStopped(_:)),
                                               name: JourneyStopStore.notification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(journeyPaused(_:)),
                                               name: JourneyPauseStore.notification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(journeyControlRequested(_:)),
                                               name: JourneyControlStore.notification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    // Serialize native trait changes with metrics so theme refreshes cannot overwrite a newer snapshot.
    private func enqueueActivityOperation(_ operation: @escaping @MainActor () async -> Void) {
        Task { @MainActor in
            let previous = self.activityQueue
            let next = Task { @MainActor in
                await previous?.value
                await operation()
            }
            self.activityQueue = next
        }
    }

    @objc func setAppearance(_ call: CAPPluginCall) {
        guard let value = call.getString("preference"), let preference = JourneyAppearance(rawValue: value),
              let themeValue = call.getString("theme"), let theme = JourneyColorTheme(rawValue: themeValue),
              let language = call.getString("language"), (language == "system" || JourneyLocalization.languages.contains(language)) else {
            call.reject("Journey appearance requires system, light, or dark and a resolved light or dark theme, and a supported language.")
            return
        }
        enqueueActivityOperation {
            self.appearance = preference
            self.colorTheme = theme
            self.language = language == "system" ? nil : language
            if #available(iOS 16.2, *) {
                for activity in Activity<JourneyActivityAttributes>.activities
                    where activity.activityState == .active || activity.activityState == .stale {
                    var state = activity.content.state
                    state.appearance = preference
                    state.colorTheme = theme
                    state.language = self.language
                    await activity.update(ActivityContent(state: state, staleDate: activity.content.staleDate))
                }
            }
            call.resolve()
        }
    }

    @MainActor func updateSystemAppearance(_ style: UIUserInterfaceStyle) {
        guard style != .unspecified else { return }
        enqueueActivityOperation {
            guard self.appearance == .system else { return }
            let theme: JourneyColorTheme = style == .dark ? .dark : .light
            guard self.colorTheme != theme else { return }
            self.colorTheme = theme
            if #available(iOS 16.2, *) {
                for activity in Activity<JourneyActivityAttributes>.activities
                    where activity.activityState == .active || activity.activityState == .stale {
                    var state = activity.content.state
                    state.appearance = self.appearance
                    state.colorTheme = self.colorTheme
                    await activity.update(ActivityContent(state: state, staleDate: activity.content.staleDate))
                }
            }
        }
    }

    @objc private func journeyControlRequested(_ notification: Notification) {
        notifyListeners("controlRequested", data: [:])
    }

    @objc func getControlRequest(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let request = try JourneyControlStore.read(defaults: .standard) else {
                    call.resolve(["request": NSNull()])
                    return
                }
                call.resolve(["request": ["id": request.id, "requestedAt": request.requestedAt]])
            } catch { call.reject("Could not read the journey control request.", nil, error) }
        }
    }

    @objc func acknowledgeControlRequest(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), UUID(uuidString: id) != nil else {
            call.reject("Acknowledging a journey control requires its valid request ID.")
            return
        }
        Task { @MainActor in
            do {
                try JourneyControlStore.acknowledge(id: id, defaults: .standard)
                call.resolve()
            } catch { call.reject("Could not acknowledge the journey control request.", nil, error) }
        }
    }

    @objc private func journeyStopped(_ notification: Notification) {
        guard let request = notification.object as? JourneyStopRequest else { return }
        notifyListeners("stopRequested", data: ["walkId": request.walkId,
                        "ownerId": request.ownerId, "finishedAt": request.finishedAt])
    }

    @objc func getStopRequest(_ call: CAPPluginCall) {
        guard let walkId = call.getString("walkId"), let ownerId = call.getString("ownerId") else {
            call.reject("Reading a widget stop requires the journey and owner IDs.")
            return
        }
        do {
            guard let request = try JourneyStopStore.read(walkId: walkId), request.ownerId == ownerId else {
                call.resolve(["request": NSNull()])
                return
            }
            call.resolve(["request": ["walkId": request.walkId, "ownerId": request.ownerId,
                                     "finishedAt": request.finishedAt]])
        } catch { call.reject("Could not read the saved widget stop request.", nil, error) }
    }

    private func pauseData(_ request: JourneyPauseRequest) -> JSObject {
        ["id": request.id, "walkId": request.walkId, "ownerId": request.ownerId,
         "paused": request.paused, "requestedAt": request.requestedAt, "activeStartedAt": request.activeStartedAt]
    }

    @objc private func journeyPaused(_ notification: Notification) {
        guard let request = notification.object as? JourneyPauseRequest else { return }
        notifyListeners("pauseRequested", data: pauseData(request), retainUntilConsumed: true)
    }

    @objc func getPauseRequest(_ call: CAPPluginCall) {
        guard let walkId = call.getString("walkId"), let ownerId = call.getString("ownerId") else {
            call.reject("Reading a widget pause requires the journey and owner IDs.")
            return
        }
        do {
            guard let request = try JourneyPauseStore.read(walkId: walkId) else { call.resolve(["request": NSNull()]); return }
            guard request.ownerId == ownerId else { call.reject("The widget pause belongs to a different account."); return }
            call.resolve(["request": pauseData(request)])
        } catch { call.reject("Could not read the saved widget pause request.", nil, error) }
    }

    @objc func acknowledgePause(_ call: CAPPluginCall) {
        guard let walkId = call.getString("walkId"), let ownerId = call.getString("ownerId"), let id = call.getString("id") else {
            call.reject("Acknowledging a widget pause requires its journey, owner and request IDs.")
            return
        }
        do {
            if let request = try JourneyPauseStore.read(walkId: walkId) {
                guard request.ownerId == ownerId else { call.reject("The widget pause belongs to a different account."); return }
                if request.id == id { JourneyPauseStore.remove(walkId: walkId) }
            }
            call.resolve()
        } catch { call.reject("Could not acknowledge the saved widget pause request.", nil, error) }
    }

    @objc func pauseLocation(_ call: CAPPluginCall) {
        guard let walkId = call.getString("walkId"), !walkId.isEmpty else { call.reject("Pausing GPS requires a journey ID."); return }
        DispatchQueue.main.async {
            JourneyPauseStore.remove(walkId: walkId)
            UserDefaults.standard.set(true, forKey: "hecate.journey.gps-paused." + walkId)
            NotificationCenter.default.post(name: JourneyPauseStore.notification, object: nil, userInfo: ["walkId": walkId, "paused": true])
            call.resolve()
        }
    }

    @objc func resumeLocation(_ call: CAPPluginCall) {
        guard let walkId = call.getString("walkId"), !walkId.isEmpty else { call.reject("Resuming GPS requires a journey ID."); return }
        DispatchQueue.main.async {
            JourneyPauseStore.remove(walkId: walkId)
            UserDefaults.standard.set(false, forKey: "hecate.journey.gps-paused." + walkId)
            NotificationCenter.default.post(name: JourneyPauseStore.notification, object: nil, userInfo: ["walkId": walkId, "paused": false])
            call.resolve()
        }
    }

    @available(iOS 16.2, *)
    private func applyingPauseRequest(_ state: JourneyActivityAttributes.ContentState, walkId: String) throws -> JourneyActivityAttributes.ContentState {
        guard let request = try JourneyPauseStore.read(walkId: walkId) else {
            if state.paused, let previous = Activity<JourneyActivityAttributes>.activities.first(where: { $0.attributes.walkId == walkId })?.content.state, previous.paused {
                var updated = state
                updated.activeStartedAt = previous.activeStartedAt
                updated.updatedAt = previous.updatedAt
                return updated
            }
            return state
        }
        var updated = state
        updated.paused = request.paused
        updated.activeStartedAt = Date(timeIntervalSince1970: request.activeStartedAt / 1000)
        updated.updatedAt = request.paused ? Date(timeIntervalSince1970: request.requestedAt / 1000) : Date()
        return updated
    }

    @objc func acknowledgeStop(_ call: CAPPluginCall) {
        guard let walkId = call.getString("walkId"), let ownerId = call.getString("ownerId") else {
            call.reject("Acknowledging a widget stop requires the journey and owner IDs.")
            return
        }
        do {
            if let request = try JourneyStopStore.read(walkId: walkId), request.ownerId != ownerId {
                call.reject("The widget stop belongs to a different account.")
                return
            }
            JourneyStopStore.remove(walkId: walkId)
            call.resolve()
        } catch { call.reject("Could not acknowledge the saved widget stop request.", nil, error) }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve()
            return
        }
        guard let walkId = call.getString("walkId"),
              let ownerId = call.getString("ownerId"),
              let startedAt = call.getDouble("startedAt"),
              let state = contentState(call, finishedAt: nil) else {
            call.reject("Starting a journey Live Activity requires valid journey metrics.")
            return
        }
        enqueueActivityOperation {
            var state = state
            state.appearance = self.appearance
            state.colorTheme = self.colorTheme
            do {
                if try JourneyStopStore.read(walkId: walkId) != nil { call.resolve(); return }
                state = try self.applyingPauseRequest(state, walkId: walkId)
                for activity in Activity<JourneyActivityAttributes>.activities {
                    if activity.attributes.walkId == walkId && activity.content.state.finishedAt != nil {
                        call.resolve()
                        return
                    }
                    if activity.attributes.walkId == walkId && activity.content.state.finishedAt == nil &&
                        (activity.activityState == .active || activity.activityState == .stale) {
                        await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(300)))
                        call.resolve()
                        return
                    }
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                guard UIApplication.shared.applicationState == .active else {
                    call.reject("Open Hecate to start the journey Live Activity.")
                    return
                }
                _ = try Activity.request(
                    attributes: JourneyActivityAttributes(
                        walkId: walkId,
                        ownerId: ownerId,
                        startedAt: Date(timeIntervalSince1970: startedAt / 1000)
                    ),
                    content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(300)),
                    pushType: nil
                )
                call.resolve()
            } catch {
                call.reject("Could not start the journey Live Activity.", nil, error)
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard let walkId = call.getString("walkId"),
              let state = contentState(call, finishedAt: nil) else {
            call.reject("Updating a journey Live Activity requires valid journey metrics.")
            return
        }
        enqueueActivityOperation {
            do {
                var state = try self.applyingPauseRequest(state, walkId: walkId)
                state.appearance = self.appearance
                state.colorTheme = self.colorTheme
                for activity in Activity<JourneyActivityAttributes>.activities
                    where activity.attributes.walkId == walkId &&
                        (activity.activityState == .active || activity.activityState == .stale) {
                    await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(300)))
                }
                call.resolve()
            } catch { call.reject("Could not update the journey pause state.", nil, error) }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard let walkId = call.getString("walkId"),
              let finishedAt = call.getDouble("finishedAt"), finishedAt.isFinite, finishedAt > 0,
              let state = contentState(call, finishedAt: Date(timeIntervalSince1970: finishedAt / 1000)) else {
            call.reject("Ending a journey Live Activity requires valid final journey metrics.")
            return
        }
        enqueueActivityOperation {
            var state = state
            state.appearance = self.appearance
            state.colorTheme = self.colorTheme
            for activity in Activity<JourneyActivityAttributes>.activities
                where activity.attributes.walkId == walkId {
                await activity.end(
                    ActivityContent(state: state, staleDate: nil),
                    dismissalPolicy: .after(Date(timeIntervalSince1970: finishedAt / 1000).addingTimeInterval(5))
                )
            }
            call.resolve()
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        enqueueActivityOperation {
            for activity in Activity<JourneyActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    @objc func reconcile(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard let ownerId = call.getString("ownerId") else {
            call.reject("A signed-in owner is required to reconcile journey Live Activities.")
            return
        }
        let walkId = call.getString("walkId")
        enqueueActivityOperation {
            for activity in Activity<JourneyActivityAttributes>.activities {
                if activity.attributes.ownerId == ownerId &&
                    (activity.attributes.walkId == walkId || activity.content.state.finishedAt != nil) {
                    continue
                }
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    @available(iOS 16.2, *)
    private func contentState(_ call: CAPPluginCall, finishedAt: Date?) -> JourneyActivityAttributes.ContentState? {
        guard let distance = call.getDouble("distanceKm"), distance.isFinite, distance >= 0 else {
            return nil
        }
        let paused = call.getBool("paused") ?? false
        let elapsedMs = call.getDouble("elapsedMs") ?? 0
        guard elapsedMs.isFinite, elapsedMs >= 0 else { return nil }
        let meters = call.getDouble("newGroundMeters")
        if let meters, !meters.isFinite || meters < 0 { return nil }
        var navigation: JourneyNavigation?
        if let value = call.getObject("navigation") {
            guard let instruction = value["instruction"] as? String, !instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let symbolValue = value["symbol"] as? String, let symbol = JourneyTurnSymbol(rawValue: symbolValue),
                  let distance = value["distanceMeters"] as? Double, distance.isFinite, distance >= 0 else { return nil }
            navigation = JourneyNavigation(instruction: instruction, symbol: symbol, distanceMeters: distance)
        }
        var navigationRemaining: JourneyNavigationRemaining?
        if let value = call.getObject("navigationRemaining") {
            // ETA data is secondary: ignore a malformed estimate instead of
            // rejecting the turn instruction and journey metrics with it.
            if let distance = value["distanceKm"] as? Double, distance.isFinite, distance >= 0,
               let duration = value["durationSeconds"] as? Double, duration.isFinite, duration >= 0 {
                navigationRemaining = JourneyNavigationRemaining(distanceKm: distance, durationSeconds: duration)
            }
        }
        return JourneyActivityAttributes.ContentState(
            distanceKm: distance,
            newGroundMeters: meters,
            paused: paused,
            activeStartedAt: (finishedAt ?? Date()).addingTimeInterval(-(elapsedMs / 1000)),
            updatedAt: Date(),
            finishedAt: finishedAt,
            navigation: finishedAt == nil ? navigation : nil,
            navigationRemaining: finishedAt == nil ? navigationRemaining : nil,
            appearance: appearance,
            colorTheme: colorTheme,
            language: language
        )
    }
}
