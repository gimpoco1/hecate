// Hecate motion-gated reminder watcher.
struct ReminderMotionState {
    let stationary: Bool
    let walking: Bool
    let running: Bool
    let automotive: Bool
    let cycling: Bool
}

func shouldTrackReminderMotion(_ motion: ReminderMotionState) -> Bool {
    return !motion.stationary && !motion.automotive && !motion.cycling
        && (motion.walking || motion.running)
}

final class MotionReminderWatcher: Watcher, CLLocationManagerDelegate {
    private let motionManager = CMMotionActivityManager()
    private let wakeManager = CLLocationManager()
    private var active = false
    private var moving = false

    override init(_ id: String, stale: Bool) {
        super.init(id, stale: stale)
        wakeManager.delegate = self
    }

    override func start() {
        guard !active else { return }
        active = true
        // Significant changes wake a suspended app without keeping GPS active.
        wakeManager.startMonitoringSignificantLocationChanges()
        observeMotion()
    }

    private func observeMotion() {
        motionManager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let self, self.active, let activity else { return }
            self.moving = shouldTrackReminderMotion(ReminderMotionState(
                stationary: activity.stationary,
                walking: activity.walking,
                running: activity.running,
                automotive: activity.automotive,
                cycling: activity.cycling
            ))
            if self.moving {
                self.startPreciseLocation()
            } else {
                self.stopPreciseLocation()
            }
        }
    }

    private func startPreciseLocation() {
        super.start()
    }

    private func stopPreciseLocation() {
        super.stop()
    }

    override func isLocationValid(_ location: CLLocation) -> Bool {
        return active && moving && super.isLocationValid(location)
    }

    override func stop() {
        active = false
        moving = false
        motionManager.stopActivityUpdates()
        wakeManager.stopMonitoringSignificantLocationChanges()
        super.stop()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active else { return }
        observeMotion()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard active else { return }
        // Report wake-service failures through the existing native error callback.
        locationManager.delegate?.locationManager?(locationManager, didFailWithError: error)
    }
}
