import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pluginPath = fileURLToPath(new URL("../node_modules/@capacitor-community/background-geolocation/ios/Plugin/Swift/Plugin.swift", import.meta.url));
const registrationPath = fileURLToPath(new URL("../node_modules/@capacitor-community/background-geolocation/ios/Plugin/Plugin.m", import.meta.url));
const androidPluginPath = fileURLToPath(new URL("../node_modules/@capacitor-community/background-geolocation/android/src/main/java/com/equimaps/capacitor_background_geolocation/BackgroundGeolocation.java", import.meta.url));
const androidServicePath = fileURLToPath(new URL("../node_modules/@capacitor-community/background-geolocation/android/src/main/java/com/equimaps/capacitor_background_geolocation/BackgroundGeolocationService.java", import.meta.url));
let androidService = readFileSync(androidServicePath, "utf8");
if (!androidService.includes("updateJourneyNotification(")) {
  const replaceService = (original, replacement) => {
    if (!androidService.includes(original))
      throw new Error("Background geolocation service changed; review Android journey notification integration.");
    androidService = androidService.replace(original, replacement);
  };
  replaceService("        public String id;", "        public String id;\n        public String journeyId;");
  replaceService("    Notification getNotification() {", `    Notification getNotification() {
        for (Watcher watcher : watchers) {
            if (watcher.journeyId != null && watcher.backgroundNotification != null) return watcher.backgroundNotification;
        }`);
  replaceService("                float distanceFilter\n", "                float distanceFilter,\n                String journeyId\n");
  replaceService("            FusedLocationProviderClient client =", `            if (journeyId != null && getSharedPreferences("hecate.journeys", MODE_PRIVATE).contains("stop." + journeyId)) return;
            FusedLocationProviderClient client =`);
  replaceService("                    Location location = locationResult.getLastLocation();", `                    boolean active = false;
                    for (Watcher registered : watchers) if (registered.id.equals(id)) active = true;
                    if (!active) return;
                    Location location = locationResult.getLastLocation();`);
  replaceService("            watcher.id = id;", "            watcher.id = id;\n            watcher.journeyId = journeyId;");
  replaceService("        void removeWatcher(String id) {", `        public boolean updateJourneyNotification(String journeyId, Notification notification) {
            for (Watcher watcher : watchers) {
                if (journeyId.equals(watcher.journeyId)) {
                    watcher.backgroundNotification = notification;
                    startForeground(NOTIFICATION_ID, notification);
                    return true;
                }
            }
            return false;
        }

        public void stopJourney(String journeyId) {
            java.util.Iterator<Watcher> iterator = watchers.iterator();
            while (iterator.hasNext()) {
                Watcher watcher = iterator.next();
                if (journeyId.equals(watcher.journeyId)) {
                    watcher.client.removeLocationUpdates(watcher.locationCallback).addOnFailureListener(
                        error -> Logger.error("Failed to remove stopped journey location updates", error));
                    iterator.remove();
                }
            }
            Notification remaining = getNotification();
            if (remaining == null) stopForeground(true);
            else startForeground(NOTIFICATION_ID, remaining);
        }

        void removeWatcher(String id) {`);
  writeFileSync(androidServicePath, androidService);
}
androidService = readFileSync(androidServicePath, "utf8");
const staleNotification = "                    if (getNotification() == null) {\n                        stopForeground(true);\n                    }";
if (androidService.includes(staleNotification)) {
  androidService = androidService.replace(staleNotification, `                    Notification remaining = getNotification();
                    if (remaining == null) stopForeground(true);
                    else startForeground(NOTIFICATION_ID, remaining);`);
  writeFileSync(androidServicePath, androidService);
}
androidService = readFileSync(androidServicePath, "utf8");
if (!androidService.includes("ConcurrentHashMap.newKeySet()")) {
  const original = "private HashSet<Watcher> watchers = new HashSet<Watcher>();";
  if (!androidService.includes(original))
    throw new Error("Background geolocation service changed; review native watcher synchronization.");
  androidService = androidService.replace(original,
    "private final java.util.Set<Watcher> watchers = java.util.concurrent.ConcurrentHashMap.newKeySet();");
  androidService = androidService.replace("watchers = new HashSet<Watcher>();", "watchers.clear();");
  for (const signature of ["void addWatcher(", "void removeWatcher(", "void onPermissionsGranted(",
    "public boolean updateJourneyNotification(", "public void stopJourney("]) {
    if (!androidService.includes(signature))
      throw new Error("Background geolocation service changed; missing synchronized journey operation: " + signature);
    androidService = androidService.replace(signature, signature.startsWith("public ")
      ? signature.replace("public ", "public synchronized ") : "synchronized " + signature);
  }
  writeFileSync(androidServicePath, androidService);
}
let androidSource = readFileSync(androidPluginPath, "utf8");
if (!androidSource.includes('call.getString("journeyId")')) {
  const anchor = '                call.getFloat("distanceFilter", 0f)';
  if (!androidSource.includes(anchor))
    throw new Error("Background geolocation plugin changed; review Android journey watcher identity.");
  androidSource = androidSource.replace(anchor, anchor + ',\n                call.getString("journeyId")');
  writeFileSync(androidPluginPath, androidSource);
}
if (!androidSource.includes("public void getAuthorizationStatus(")) {
  const anchor = "    @PluginMethod()\n    public void openSettings(PluginCall call) {";
  if (!androidSource.includes(anchor))
    throw new Error("Background geolocation plugin changed; review Android location authorization check.");
  androidSource = androidSource.replace(anchor, `
    @PluginMethod
    public void getAuthorizationStatus(PluginCall call) {
        boolean foreground = androidx.core.content.ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
            androidx.core.content.ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
        boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            androidx.core.content.ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("status", !foreground ? "denied" : background ? "always" : "whenInUse");
        call.resolve(result);
    }

` + anchor);
  writeFileSync(androidPluginPath, androidSource);
}
const indicatorOriginal = "manager.showsBackgroundLocationIndicator = background";
const indicatorReplacement = 'manager.showsBackgroundLocationIndicator = call.getBool("showsBackgroundLocationIndicator") ?? background';
const methodsOriginal = 'CAPPluginMethod(name: "removeWatcher", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)';
const methodsReplacement = 'CAPPluginMethod(name: "removeWatcher", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "removeAllWatchers", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)';
const removeAllImplementation = `
    @objc func removeAllWatchers(_ call: CAPPluginCall) {
        // A WebView reload can discard JavaScript watcher IDs without
        // destroying this native plugin. Stop every orphan before the new
        // JavaScript runtime starts location tracking again.
        DispatchQueue.main.async {
            let callbackIds = self.watchers.map { $0.callbackId }
            self.watchers.forEach { $0.stop() }
            self.watchers.removeAll()
            callbackIds.forEach { callbackId in
                if let savedCall = self.bridge?.savedCall(withID: callbackId) {
                    self.bridge?.releaseCall(savedCall)
                }
            }
            return call.resolve()
        }
    }

`;
const implementationAnchor = "    @objc func openSettings(_ call: CAPPluginCall) {";
const registrationOriginal = "    CAP_PLUGIN_METHOD(removeWatcher, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);";
const registrationReplacement = "    CAP_PLUGIN_METHOD(removeWatcher, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(removeAllWatchers, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);";
let source = readFileSync(pluginPath, "utf8");

if (!source.includes(indicatorReplacement)) {
  if (!source.includes(indicatorOriginal)) {
    throw new Error("Background geolocation plugin changed; review the iOS indicator patch before building.");
  }
  source = source.replace(indicatorOriginal, indicatorReplacement);
}
if (!source.includes('CAPPluginMethod(name: "removeAllWatchers",')) {
  if (!source.includes(methodsOriginal)) {
    throw new Error("Background geolocation plugin changed; review the iOS method registration before building.");
  }
  source = source.replace(methodsOriginal, methodsReplacement);
}
if (!source.includes("@objc func removeAllWatchers")) {
  if (!source.includes(implementationAnchor)) {
    throw new Error("Background geolocation plugin changed; review the iOS watcher cleanup patch before building.");
  }
  source = source.replace(implementationAnchor, `${removeAllImplementation}${implementationAnchor}`);
}
writeFileSync(pluginPath, source);

// Xcode 27.2 can emit a Date comparison call whose iOS runtime symbol is absent.
// Compare reference timestamps to retain the stale-fix boundary without that operator.
source = readFileSync(pluginPath, "utf8");
const timestampComparison = "location.timestamp.timeIntervalSinceReferenceDate >= created.timeIntervalSinceReferenceDate";
if (!source.includes(timestampComparison)) {
  const dateComparison = "location.timestamp >= created";
  if (!source.includes(dateComparison))
    throw new Error("Background geolocation plugin changed; review the iOS stale-location comparison.");
  source = source.replace(dateComparison, timestampComparison);
  writeFileSync(pluginPath, source);
}

// A LiveActivityIntent runs in the app process without bringing its WebView to the foreground.
// Stop only the matching recorded walk, preserving passive discovery-reminder watchers.
source = readFileSync(pluginPath, "utf8");
if (!source.includes("private var journeyStopObserver: NSObjectProtocol?")) {
  const replaceRequired = (original, replacement) => {
    if (!source.includes(original))
      throw new Error("Background geolocation plugin changed; review the native widget stop integration.");
    source = source.replace(original, replacement);
  };
  replaceRequired("    let callbackId: String", "    var journeyId: String?\n    let callbackId: String");
  replaceRequired("    private var watchers = [Watcher]()", `    private var watchers = [Watcher]()
    private var journeyStopObserver: NSObjectProtocol?

    deinit {
        if let journeyStopObserver { NotificationCenter.default.removeObserver(journeyStopObserver) }
    }

    private func stopJourneyWatchers(_ walkId: String) {
        let stopped = watchers.filter { $0.journeyId == walkId }
        stopped.forEach { watcher in
            watcher.stop()
            if let call = bridge?.savedCall(withID: watcher.callbackId) { bridge?.releaseCall(call) }
        }
        watchers.removeAll { $0.journeyId == walkId }
    }`);
  replaceRequired("        UIDevice.current.isBatteryMonitoringEnabled = true", `        UIDevice.current.isBatteryMonitoringEnabled = true
        journeyStopObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("HecateJourneyStopRequested"), object: nil, queue: .main
        ) { [weak self] notification in
            if let walkId = notification.userInfo?["walkId"] as? String {
                self?.stopJourneyWatchers(walkId)
            }
        }`);
  replaceRequired('            let background = call.getString("backgroundMessage") != nil', `            let journeyId = call.getString("journeyId")
            if let journeyId, UserDefaults.standard.data(forKey: "hecate.journey.stop." + journeyId) != nil {
                call.reject("This journey was stopped from the Lock Screen.", "JOURNEY_STOPPED")
                return
            }
            let background = call.getString("backgroundMessage") != nil`);
  replaceRequired("            let manager = watcher.locationManager", "            watcher.journeyId = journeyId\n            let manager = watcher.locationManager");
  writeFileSync(pluginPath, source);
}

let registration = readFileSync(registrationPath, "utf8");
if (!registration.includes("CAP_PLUGIN_METHOD(removeAllWatchers,")) {
  if (!registration.includes(registrationOriginal)) {
    throw new Error("Background geolocation plugin changed; review the Objective-C registration patch before building.");
  }
  registration = registration.replace(registrationOriginal, registrationReplacement);
  writeFileSync(registrationPath, registration);
}

const permissionMethod = 'CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),';
source = readFileSync(pluginPath, "utf8");
if (!source.includes(permissionMethod)) {
  source = source.replace(
    'CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)',
    permissionMethod + '\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)',
  );
  source = source.replace(implementationAnchor, `
    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let status: String
            switch CLLocationManager.authorizationStatus() {
            case .authorizedAlways: status = "always"
            case .authorizedWhenInUse: status = "whenInUse"
            case .denied, .restricted: status = "denied"
            case .notDetermined: status = "notDetermined"
            @unknown default:
                return call.reject("Unrecognized iOS location authorization status")
            }
            call.resolve(["status": status])
        }
    }

` + implementationAnchor);
  writeFileSync(pluginPath, source);
}
registration = readFileSync(registrationPath, "utf8");
if (!registration.includes("CAP_PLUGIN_METHOD(getAuthorizationStatus,")) {
  registration = registration.replace(
    "    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);",
    "    CAP_PLUGIN_METHOD(getAuthorizationStatus, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);",
  );
  writeFileSync(registrationPath, registration);
}

// Stop recording watchers at the service boundary, even while the WebView sleeps.
androidService = readFileSync(androidServicePath, "utf8");
if (!androidService.includes("private final android.content.BroadcastReceiver airplaneModeReceiver")) {
  const anchor = "    // Handles requests from the activity.";
  if (!androidService.includes(anchor))
    throw new Error("Background geolocation service changed; review airplane-mode receiver integration.");
  androidService = androidService.replace(anchor, `    private boolean isAirplaneModeOn() {
        return android.provider.Settings.Global.getInt(getContentResolver(),
                android.provider.Settings.Global.AIRPLANE_MODE_ON, 0) != 0;
    }

    private final android.content.BroadcastReceiver airplaneModeReceiver = new android.content.BroadcastReceiver() {
        @Override public void onReceive(android.content.Context context, Intent intent) {
            if (!isAirplaneModeOn()) return;
            for (Watcher watcher : new java.util.ArrayList<>(watchers)) {
                if (watcher.journeyId == null) continue;
                ((LocalBinder) binder).stopJourney(watcher.journeyId);
                // Reuse the persisted stop request so a runtime restart cannot resume this journey.
                sendBroadcast(new Intent("com.gimpoco.hecate.STOP_JOURNEY")
                        .setClassName(getPackageName(), "com.gimpoco.hecate.JourneyActionReceiver")
                        .putExtra("walkId", watcher.journeyId));
                Intent stopped = new Intent(ACTION_BROADCAST);
                stopped.putExtra("id", watcher.id);
                stopped.putExtra("journeyError", "AIRPLANE_MODE");
                LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(stopped);
            }
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        androidx.core.content.ContextCompat.registerReceiver(this, airplaneModeReceiver,
                new android.content.IntentFilter(Intent.ACTION_AIRPLANE_MODE_CHANGED),
                androidx.core.content.ContextCompat.RECEIVER_EXPORTED);
    }

    @Override public void onDestroy() {
        unregisterReceiver(airplaneModeReceiver);
        super.onDestroy();
    }

` + anchor);
  const startAnchor = "            FusedLocationProviderClient client =";
  if (!androidService.includes(startAnchor))
    throw new Error("Background geolocation service changed; review airplane-mode startup check.");
  androidService = androidService.replace(startAnchor, `            if (journeyId != null && isAirplaneModeOn()) {
                Intent stopped = new Intent(ACTION_BROADCAST);
                stopped.putExtra("id", id);
                stopped.putExtra("journeyError", "AIRPLANE_MODE");
                LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(stopped);
                return;
            }
` + startAnchor);
  writeFileSync(androidServicePath, androidService);
}
androidSource = readFileSync(androidPluginPath, "utf8")
  .replace("Your recorded walking progress has been saved.", "Your recorded journey progress has been saved.");
if (!androidSource.includes('intent.getStringExtra("journeyError")')) {
  const anchor = '            Location location = intent.getParcelableExtra("location");';
  if (!androidSource.includes(anchor))
    throw new Error("Background geolocation plugin changed; review airplane-mode stop callback.");
  androidSource = androidSource.replace(anchor, `            String journeyError = intent.getStringExtra("journeyError");
            if (journeyError != null) {
                call.reject("Journey stopped because airplane mode is on. Your recorded journey progress has been saved.", journeyError);
                return;
            }
` + anchor);
}
writeFileSync(androidPluginPath, androidSource);

// Idle discovery reminders use motion and significant changes, not continuous GPS.
source = readFileSync(pluginPath, "utf8");
const motionWatcherMarker = "// Hecate motion-gated reminder watcher.";
const existingMotionWatcher = source.indexOf(motionWatcherMarker);
if (existingMotionWatcher !== -1) source = source.slice(0, existingMotionWatcher).trimEnd() + "\n";
if (!source.includes("import CoreMotion")) source = source.replace("import CoreLocation", "import CoreLocation\nimport CoreMotion");
if (!source.includes("class Watcher: NSObject")) {
  if (!source.includes("class Watcher {") || !source.includes("        allowStale = stale\n"))
    throw new Error("Background geolocation plugin changed; review motion watcher initialization.");
  source = source.replace("class Watcher {", "class Watcher: NSObject {")
    .replace("        allowStale = stale\n", "        allowStale = stale\n        super.init()\n");
}
if (!source.includes('let motionGated = call.getBool("motionGated")')) {
  const original = `            let watcher = Watcher(
                call.callbackId,
                stale: call.getBool("stale") ?? false
            )`;
  if (!source.includes(original)) throw new Error("Background geolocation plugin changed; review motion-gated watcher creation.");
  source = source.replace(original, `            let motionGated = call.getBool("motionGated") == true
            if motionGated {
                guard CMMotionActivityManager.isActivityAvailable(), CLLocationManager.significantLocationChangeMonitoringAvailable() else {
                    call.reject("Motion-based discovery reminders are unavailable on this device.", "MOTION_UNAVAILABLE")
                    return
                }
                guard CMMotionActivityManager.authorizationStatus() == .authorized else {
                    call.reject("Allow Motion & Fitness in Hecate's device settings to enable background discovery reminders.", "MOTION_NOT_AUTHORIZED")
                    return
                }
            }
            let watcher: Watcher = motionGated
                ? MotionReminderWatcher(call.callbackId, stale: call.getBool("stale") ?? false)
                : Watcher(call.callbackId, stale: call.getBool("stale") ?? false)`);
}
source = source.replace("self.watchers[index].locationManager.stopUpdatingLocation()", "self.watchers[index].stop()");
if (!source.includes("manager.activityType = journeyId")) {
  source = source.replace("            manager.allowsBackgroundLocationUpdates = background", `            if journeyId == nil { manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters }
            manager.activityType = journeyId == nil ? .other : .fitness
            manager.allowsBackgroundLocationUpdates = background`);
}
if (!source.includes("@objc func requestMotionPermission")) {
  source = source.replace("    private var watchers = [Watcher]()", "    private var watchers = [Watcher]()\n    private let motionPermissionManager = CMMotionActivityManager()");
  source = source.replace('CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)', 'CAPPluginMethod(name: "requestMotionPermission", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)');
  source = source.replace(implementationAnchor, `    @objc func requestMotionPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard CMMotionActivityManager.isActivityAvailable(), CLLocationManager.significantLocationChangeMonitoringAvailable() else {
                call.reject("Motion-based discovery reminders are unavailable on this device.", "MOTION_UNAVAILABLE")
                return
            }
            let status = CMMotionActivityManager.authorizationStatus()
            if status != .notDetermined {
                call.resolve(["granted": status == .authorized])
                return
            }
            guard UIApplication.shared.applicationState == .active else {
                call.reject("Open Hecate to allow Motion & Fitness for background discovery reminders.", "MOTION_REQUIRES_FOREGROUND")
                return
            }
            let now = Date()
            self.motionPermissionManager.queryActivityStarting(from: now.addingTimeInterval(-1), to: now, to: .main) { _, error in
                let status = CMMotionActivityManager.authorizationStatus()
                if status == .denied || status == .restricted {
                    call.resolve(["granted": false])
                } else if let error {
                    call.reject("Could not request Motion & Fitness permission: " + error.localizedDescription)
                } else if status == .authorized {
                    call.resolve(["granted": true])
                } else {
                    call.reject("Motion & Fitness permission has not been determined. Open Hecate and try again.")
                }
            }
        }
    }

` + implementationAnchor);
}
source += "\n" + readFileSync(new URL("./ios-reminder-motion.swift", import.meta.url), "utf8");
writeFileSync(pluginPath, source);
registration = readFileSync(registrationPath, "utf8");
if (!registration.includes("CAP_PLUGIN_METHOD(requestMotionPermission,")) {
  registration = registration.replace("    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);", "    CAP_PLUGIN_METHOD(requestMotionPermission, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);");
  writeFileSync(registrationPath, registration);
}

// Inspect denied permissions without prompting when reminders are switched off.
source = readFileSync(pluginPath, "utf8");
if (!source.includes("@objc func getMotionAuthorizationStatus")) {
  source = source.replace('CAPPluginMethod(name: "requestMotionPermission", returnType: CAPPluginReturnPromise)', 'CAPPluginMethod(name: "getMotionAuthorizationStatus", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "requestMotionPermission", returnType: CAPPluginReturnPromise)');
  source = source.replace("    @objc func requestMotionPermission(_ call: CAPPluginCall) {", `    @objc func getMotionAuthorizationStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard CMMotionActivityManager.isActivityAvailable(), CLLocationManager.significantLocationChangeMonitoringAvailable() else {
                call.resolve(["status": "unavailable"])
                return
            }
            let status: String
            switch CMMotionActivityManager.authorizationStatus() {
            case .authorized: status = "authorized"
            case .denied: status = "denied"
            case .restricted: status = "restricted"
            case .notDetermined: status = "notDetermined"
            @unknown default:
                call.reject("Unrecognized Motion & Fitness authorization status")
                return
            }
            call.resolve(["status": status])
        }
    }

    @objc func requestMotionPermission(_ call: CAPPluginCall) {`);
  writeFileSync(pluginPath, source);
}
registration = readFileSync(registrationPath, "utf8");
if (!registration.includes("CAP_PLUGIN_METHOD(getMotionAuthorizationStatus,")) {
  registration = registration.replace("    CAP_PLUGIN_METHOD(requestMotionPermission, CAPPluginReturnPromise);", "    CAP_PLUGIN_METHOD(getMotionAuthorizationStatus, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(requestMotionPermission, CAPPluginReturnPromise);");
  writeFileSync(registrationPath, registration);
}

await import("./patch-android-reminder-motion.mjs");
