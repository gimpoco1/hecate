import Capacitor
import CoreLocation
import CoreMotion
import Foundation

@objc(JourneyMotionPlugin)
public class JourneyMotionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "JourneyMotionPlugin"
    public let jsName = "JourneyMotion"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAvailability", returnType: CAPPluginReturnPromise)
    ]
    private let motionManager = CMMotionActivityManager()
    private let authorizationManager = CLLocationManager()
    private var stopLocationUpdates: (() -> Void)?
    private var active = false
    private var latest: JSObject?
    private var lastHeartbeatAt = Date.distantPast
    private var stationary = false
    private var awaitingMotion = false

    deinit {
        stopLocationUpdates?()
        motionManager.stopActivityUpdates()
    }

    @objc func getAvailability(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) { call.resolve(["available": CMMotionActivityManager.isActivityAvailable()]) }
        else { call.resolve(["available": false]) }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard #available(iOS 17.0, *) else {
                call.reject("Automatic journey detection requires iOS 17 or later.", "AUTOMATION_UNAVAILABLE")
                return
            }
            guard CMMotionActivityManager.isActivityAvailable() else {
                call.reject("Motion recognition is unavailable on this device.", "MOTION_UNAVAILABLE")
                return
            }
            guard CMMotionActivityManager.authorizationStatus() == .authorized else {
                call.reject("Allow Motion & Fitness in Hecate's device settings.", "MOTION_NOT_AUTHORIZED")
                return
            }
            guard CLLocationManager.locationServicesEnabled(),
                  self.authorizationManager.authorizationStatus == .authorizedAlways || self.authorizationManager.authorizationStatus == .authorizedWhenInUse else {
                call.reject("Allow location access so journey automation can run while your phone is locked.", "LOCATION_NOT_AUTHORIZED")
                return
            }
            self.stopLocationUpdates?()
            self.active = true
            self.latest = nil
            self.stationary = false
            self.awaitingMotion = true
            self.lastHeartbeatAt = .distantPast
            self.startAdaptiveUpdates()
            self.observe()
            call.resolve()
        }
    }

    @available(iOS 17.0, *)
    private func startAdaptiveUpdates() {
        // Always authorization supports background monitoring without an in-use indicator session.
        // When In Use needs the session only while an active journey uses automatic pause/resume.
        let session: CLBackgroundActivitySession? = authorizationManager.authorizationStatus == .authorizedAlways
            ? nil : CLBackgroundActivitySession()
        let updates = Task { @MainActor [weak self] in
            do {
                for try await update in CLLocationUpdate.liveUpdates(.default) {
                    guard let self, self.active, !Task.isCancelled else { break }
                    let isStationary: Bool
                    if #available(iOS 18.0, *) { isStationary = update.stationary }
                    // iOS 17 only provides this name; the current SDK deprecates it from introduction.
                    else { isStationary = update.isStationary }
                    if isStationary {
                        self.stationary = true
                        if self.latest?["activity"] as? String != "stationary" {
                            self.publish(activity: "stationary", since: Date().timeIntervalSince1970 * 1000)
                        }
                    } else if update.location != nil {
                        if self.stationary {
                            self.stationary = false
                            self.awaitingMotion = true
                            self.latest = nil
                            // Refresh classification after Core Location wakes the suspended app.
                            self.observe()
                        }
                        guard !self.awaitingMotion else { continue }
                        let now = Date()
                        if now.timeIntervalSince(self.lastHeartbeatAt) >= 10 {
                            self.lastHeartbeatAt = now
                            if let latest = self.latest { self.notifyListeners("motion", data: latest, retainUntilConsumed: true) }
                        }
                    }
                    // Keep iterating while stationary: ending the sequence would prevent automatic resume.
                }
            } catch is CancellationError {
                // Explicit stop cancels the location sequence.
            } catch {
                guard let self, self.active, !Task.isCancelled else { return }
                let failure = error as NSError
                self.notifyListeners("monitorError", data: ["code": failure.code, "message": error.localizedDescription], retainUntilConsumed: true)
            }
        }
        stopLocationUpdates = { updates.cancel(); session?.invalidate() }
    }

    private func publish(activity: String, since: Double) {
        let sample: JSObject = ["activity": activity, "since": since]
        latest = sample
        notifyListeners("motion", data: sample, retainUntilConsumed: true)
    }

    private func observe() {
        motionManager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let self, self.active, let activity else { return }
            self.awaitingMotion = false
            let kind: String
            if activity.confidence == .low { kind = "unknown" }
            else if activity.automotive { kind = "other" }
            else if activity.stationary { kind = "stationary" }
            else if activity.cycling { kind = "cycling" }
            else if activity.walking || activity.running { kind = "walking" }
            else { kind = "unknown" }
            self.publish(activity: kind, since: activity.startDate.timeIntervalSince1970 * 1000)
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard CMMotionActivityManager.authorizationStatus() == .authorized else {
                call.reject("Motion & Fitness access was revoked. Enable it in Settings.", "MOTION_NOT_AUTHORIZED")
                return
            }
            if let latest = self.latest { call.resolve(["motion": latest]) }
            else { call.resolve(["motion": NSNull()]) }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.active = false
            self.motionManager.stopActivityUpdates()
            self.stopLocationUpdates?()
            self.stopLocationUpdates = nil
            self.latest = nil
            call.resolve()
        }
    }
}
