import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pluginPath = fileURLToPath(new URL('../node_modules/@capacitor-community/background-geolocation/ios/Plugin/Swift/Plugin.swift', import.meta.url))
const registrationPath = fileURLToPath(new URL('../node_modules/@capacitor-community/background-geolocation/ios/Plugin/Plugin.m', import.meta.url))
const androidPluginPath = fileURLToPath(new URL('../node_modules/@capacitor-community/background-geolocation/android/src/main/java/com/equimaps/capacitor_background_geolocation/BackgroundGeolocation.java', import.meta.url))
let androidSource = readFileSync(androidPluginPath, 'utf8')
if (!androidSource.includes('public void getAuthorizationStatus(')) {
  const anchor = '    @PluginMethod()\n    public void openSettings(PluginCall call) {'
  if (!androidSource.includes(anchor))
    throw new Error('Background geolocation plugin changed; review Android location authorization check.')
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

` + anchor)
  writeFileSync(androidPluginPath, androidSource)
}
const indicatorOriginal = 'manager.showsBackgroundLocationIndicator = background'
const indicatorReplacement = 'manager.showsBackgroundLocationIndicator = call.getBool("showsBackgroundLocationIndicator") ?? background'
const methodsOriginal = 'CAPPluginMethod(name: "removeWatcher", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)'
const methodsReplacement = 'CAPPluginMethod(name: "removeWatcher", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "removeAllWatchers", returnType: CAPPluginReturnPromise),\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)'
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

`
const implementationAnchor = '    @objc func openSettings(_ call: CAPPluginCall) {'
const registrationOriginal = '    CAP_PLUGIN_METHOD(removeWatcher, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);'
const registrationReplacement = '    CAP_PLUGIN_METHOD(removeWatcher, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(removeAllWatchers, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);'
let source = readFileSync(pluginPath, 'utf8')

if (!source.includes(indicatorReplacement)) {
  if (!source.includes(indicatorOriginal)) {
    throw new Error('Background geolocation plugin changed; review the iOS indicator patch before building.')
  }
  source = source.replace(indicatorOriginal, indicatorReplacement)
}
if (!source.includes('CAPPluginMethod(name: "removeAllWatchers",')) {
  if (!source.includes(methodsOriginal)) {
    throw new Error('Background geolocation plugin changed; review the iOS method registration before building.')
  }
  source = source.replace(methodsOriginal, methodsReplacement)
}
if (!source.includes('@objc func removeAllWatchers')) {
  if (!source.includes(implementationAnchor)) {
    throw new Error('Background geolocation plugin changed; review the iOS watcher cleanup patch before building.')
  }
  source = source.replace(implementationAnchor, `${removeAllImplementation}${implementationAnchor}`)
}
writeFileSync(pluginPath, source)

// A LiveActivityIntent runs in the app process without bringing its WebView to the foreground.
// Stop only the matching recorded walk, preserving passive discovery-reminder watchers.
source = readFileSync(pluginPath, 'utf8')
if (!source.includes('private var journeyStopObserver: NSObjectProtocol?')) {
  const replaceRequired = (original, replacement) => {
    if (!source.includes(original))
      throw new Error('Background geolocation plugin changed; review the native widget stop integration.')
    source = source.replace(original, replacement)
  }
  replaceRequired('    let callbackId: String', '    var journeyId: String?\n    let callbackId: String')
  replaceRequired('    private var watchers = [Watcher]()', `    private var watchers = [Watcher]()
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
    }`)
  replaceRequired('        UIDevice.current.isBatteryMonitoringEnabled = true', `        UIDevice.current.isBatteryMonitoringEnabled = true
        journeyStopObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("HecateJourneyStopRequested"), object: nil, queue: .main
        ) { [weak self] notification in
            if let walkId = notification.userInfo?["walkId"] as? String {
                self?.stopJourneyWatchers(walkId)
            }
        }`)
  replaceRequired('            let background = call.getString("backgroundMessage") != nil', `            let journeyId = call.getString("journeyId")
            if let journeyId, UserDefaults.standard.data(forKey: "hecate.journey.stop." + journeyId) != nil {
                call.reject("This journey was stopped from the Lock Screen.", "JOURNEY_STOPPED")
                return
            }
            let background = call.getString("backgroundMessage") != nil`)
  replaceRequired('            let manager = watcher.locationManager', '            watcher.journeyId = journeyId\n            let manager = watcher.locationManager')
  writeFileSync(pluginPath, source)
}

let registration = readFileSync(registrationPath, 'utf8')
if (!registration.includes('CAP_PLUGIN_METHOD(removeAllWatchers,')) {
  if (!registration.includes(registrationOriginal)) {
    throw new Error('Background geolocation plugin changed; review the Objective-C registration patch before building.')
  }
  registration = registration.replace(registrationOriginal, registrationReplacement)
  writeFileSync(registrationPath, registration)
}

const permissionMethod = 'CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),'
source = readFileSync(pluginPath, 'utf8')
if (!source.includes(permissionMethod)) {
  source = source.replace(
    'CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)',
    permissionMethod + '\n        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)',
  )
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

` + implementationAnchor)
  writeFileSync(pluginPath, source)
}
registration = readFileSync(registrationPath, 'utf8')
if (!registration.includes('CAP_PLUGIN_METHOD(getAuthorizationStatus,')) {
  registration = registration.replace(
    '    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);',
    '    CAP_PLUGIN_METHOD(getAuthorizationStatus, CAPPluginReturnPromise);\n    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);',
  )
  writeFileSync(registrationPath, registration)
}
