import Capacitor
import CoreLocation
import CoreMotion
import Foundation

@objc(JourneyMotionPlugin)
public class JourneyMotionPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "JourneyMotionPlugin"
    public let jsName = "JourneyMotion"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]
    private let motionManager = CMMotionActivityManager()
    private let wakeManager = CLLocationManager()
    private var active = false
    private var latest: JSObject?

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard CMMotionActivityManager.isActivityAvailable() else {
                call.reject("Motion recognition is unavailable on this device.", "MOTION_UNAVAILABLE")
                return
            }
            guard CMMotionActivityManager.authorizationStatus() == .authorized else {
                call.reject("Allow Motion & Fitness in Hecate's device settings.", "MOTION_NOT_AUTHORIZED")
                return
            }
            self.active = true
            self.latest = nil
            self.wakeManager.delegate = self
            if self.wakeManager.authorizationStatus == .authorizedAlways {
                self.wakeManager.startMonitoringSignificantLocationChanges()
            }
            self.observe()
            call.resolve()
        }
    }

    private func observe() {
        motionManager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let self, self.active, let activity else { return }
            let kind: String
            if activity.confidence == .low { kind = "unknown" }
            else if activity.automotive { kind = "other" }
            else if activity.stationary { kind = "stationary" }
            else if activity.cycling { kind = "cycling" }
            else if activity.walking || activity.running { kind = "walking" }
            else { kind = "unknown" }
            let sample: JSObject = ["activity": kind, "since": activity.startDate.timeIntervalSince1970 * 1000]
            self.latest = sample
            self.notifyListeners("motion", data: sample, retainUntilConsumed: true)
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
            self.wakeManager.stopMonitoringSignificantLocationChanges()
            self.latest = nil
            call.resolve()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if active { observe() }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        CAPLog.print("Journey motion wake monitoring failed", error.localizedDescription)
    }
}
