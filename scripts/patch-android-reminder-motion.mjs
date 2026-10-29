import { readFileSync, writeFileSync } from "node:fs";

const directory = new URL("../node_modules/@capacitor-community/background-geolocation/android/src/main/java/com/equimaps/capacitor_background_geolocation/", import.meta.url);
for (const file of ["AndroidReminderMotionState.java", "AndroidReminderMotionMonitor.java", "AndroidReminderMotionReceiver.java"])
  writeFileSync(new URL(file, directory), readFileSync(new URL(file, import.meta.url), "utf8"));
const servicePath = new URL("BackgroundGeolocationService.java", directory);
const pluginPath = new URL("BackgroundGeolocation.java", directory);
function replaceRequired(source, original, replacement) {
  if (!source.includes(original)) throw new Error("Android location plugin changed; missing motion integration anchor: " + original.slice(0, 90));
  return source.replace(original, replacement);
}
let service = readFileSync(servicePath, "utf8");
if (!service.includes("AndroidReminderMotionMonitor motionMonitor")) {
  service = replaceRequired(service, "import java.util.HashSet;", "import java.util.HashSet;\nimport com.google.android.gms.tasks.Task;\nimport com.google.android.gms.tasks.Tasks;");
  service = replaceRequired(service, "        public String journeyId;", `        public String journeyId;
        public boolean motionGated;
        public volatile boolean locationRequested;
        public long locationRevision;
        public Task<Void> locationOperation = Tasks.forResult(null);`);
  const anchor = "    // Handles requests from the activity.";
  service = replaceRequired(service, anchor, `    private AndroidReminderMotionMonitor motionMonitor;
    private boolean reminderMoving = false;

    private Task<Void> startWatcherLocation(Watcher watcher) {
        synchronized (watcher) {
            if (watcher.locationRequested) return watcher.locationOperation;
            watcher.locationRequested = true;
            long revision = ++watcher.locationRevision;
            watcher.locationOperation = watcher.locationOperation.continueWithTask(previous -> {
                if (!previous.isSuccessful()) throw previous.getException() != null ? previous.getException() : new IllegalStateException("Location operation was cancelled");
                if (!watchers.contains(watcher) || !watcher.locationRequested || watcher.locationRevision != revision) return Tasks.forResult(null);
                return watcher.client.requestLocationUpdates(watcher.locationRequest, watcher.locationCallback, android.os.Looper.getMainLooper());
            });
            watcher.locationOperation.addOnFailureListener(error -> {
                if (watchers.contains(watcher) && watcher.locationRequested) failWatcher(watcher, error);
            });
            return watcher.locationOperation;
        }
    }

    private Task<Void> stopWatcherLocation(Watcher watcher) {
        synchronized (watcher) {
            watcher.locationRequested = false;
            watcher.locationRevision += 1;
            watcher.locationOperation = watcher.locationOperation.continueWithTask(previous ->
                watcher.client.removeLocationUpdates(watcher.locationCallback));
            return watcher.locationOperation;
        }
    }

    private void failWatcher(Watcher watcher, Exception error) {
        Logger.error("Native location watcher failed", error);
        stopWatcherLocation(watcher).addOnFailureListener(failure -> Logger.error("Failed to stop location after watcher failure", failure));
        Intent failed = new Intent(ACTION_BROADCAST);
        failed.putExtra("id", watcher.id);
        failed.putExtra("watcherError", error.getMessage());
        failed.putExtra("watcherErrorCode", error instanceof SecurityException ? "NOT_AUTHORIZED" : "LOCATION_UNAVAILABLE");
        LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(failed);
    }

    void onReminderMovement(boolean moving) {
        reminderMoving = moving;
        for (Watcher watcher : watchers) {
            if (!watcher.motionGated) continue;
            if (moving) startWatcherLocation(watcher);
            else stopWatcherLocation(watcher).addOnFailureListener(error -> failWatcher(watcher, error));
        }
    }

    private void ensureMotionMonitor() {
        if (motionMonitor != null) return;
        AndroidReminderMotionMonitor monitor = new AndroidReminderMotionMonitor(this, new AndroidReminderMotionMonitor.Listener() {
            @Override public void onMovementChanged(boolean moving) { onReminderMovement(moving); }
            @Override public void onFailure(Exception error) {
                onReminderMovement(false);
                for (Watcher watcher : watchers) if (watcher.motionGated) failWatcher(watcher, error);
            }
        });
        motionMonitor = monitor;
        monitor.start().addOnFailureListener(error -> {
            if (motionMonitor != monitor) return;
            onReminderMovement(false);
            for (Watcher watcher : watchers) if (watcher.motionGated) failWatcher(watcher, error);
        });
    }

    private Task<Void> stopUnusedMotionMonitor() {
        for (Watcher watcher : watchers) if (watcher.motionGated) return Tasks.forResult(null);
        AndroidReminderMotionMonitor monitor = motionMonitor;
        motionMonitor = null;
        reminderMoving = false;
        return monitor == null ? Tasks.forResult(null) : monitor.stop();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null && intent.getAction().startsWith(AndroidReminderMotionMonitor.ACTION_PREFIX)) {
            if (motionMonitor != null) motionMonitor.onIntent(intent);
            else if (watchers.isEmpty()) stopSelf(startId);
        }
        return START_NOT_STICKY;
    }

` + anchor);
  service = replaceRequired(service, "                String journeyId\n        ) {", "                String journeyId,\n                boolean motionGated\n        ) {");
  service = replaceRequired(service, "            watcher.journeyId = journeyId;", "            watcher.journeyId = journeyId;\n            watcher.motionGated = motionGated;");
  service = replaceRequired(service, `            // According to Android Studio, this method can throw a Security Exception if
            // permissions are not yet granted. Rather than check the permissions, which is fiddly,
            // we simply ignore the exception.
            try {
                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );
            } catch (SecurityException ignore) {}`, `            if (motionGated) {
                ensureMotionMonitor();
                if (reminderMoving) startWatcherLocation(watcher);
            } else startWatcherLocation(watcher);`);
  service = replaceRequired(service, "if (registered.id.equals(id)) active = true;", "if (registered.id.equals(id) && registered.locationRequested) active = true;");
  service = replaceRequired(service, "            watcher.client.removeLocationUpdates(watcher.locationCallback);\n        }\n        watchers.clear();", '            stopWatcherLocation(watcher).addOnFailureListener(error -> Logger.error("Could not remove unbound location watcher", error));\n        }\n        watchers.clear();\n        stopUnusedMotionMonitor().addOnFailureListener(error -> Logger.error("Could not stop unbound motion monitor", error));');
  service = replaceRequired(service, "        unregisterReceiver(airplaneModeReceiver);", `        for (Watcher watcher : watchers) stopWatcherLocation(watcher).addOnFailureListener(error -> Logger.error("Could not remove destroyed location watcher", error));
        watchers.clear();
        stopUnusedMotionMonitor().addOnFailureListener(error -> Logger.error("Could not stop destroyed motion monitor", error));
        unregisterReceiver(airplaneModeReceiver);`);
  service = replaceRequired(service, "                    watcher.client.removeLocationUpdates(watcher.locationCallback).addOnFailureListener(", "                    stopWatcherLocation(watcher).addOnFailureListener(");
  const begin = service.indexOf("        synchronized void removeWatcher(String id) {");
  const end = service.indexOf("        synchronized void onPermissionsGranted()", begin);
  if (begin < 0 || end < 0) throw new Error("Android watcher removal changed; review motion cleanup");
  service = service.slice(0, begin) + `        synchronized Task<Void> removeWatcher(String id) {
            for (Watcher watcher : watchers) {
                if (!watcher.id.equals(id)) continue;
                watchers.remove(watcher);
                Task<Void> location = stopWatcherLocation(watcher);
                Task<Void> motion = stopUnusedMotionMonitor();
                Notification remaining = getNotification();
                if (remaining == null) stopForeground(true);
                else startForeground(NOTIFICATION_ID, remaining);
                return Tasks.whenAll(location, motion);
            }
            return Tasks.forResult(null);
        }

        synchronized Task<Void> removeAllWatchers() {
            java.util.List<Task<Void>> removals = new java.util.ArrayList<>();
            for (Watcher watcher : new java.util.ArrayList<>(watchers)) removals.add(removeWatcher(watcher.id));
            return Tasks.whenAll(removals);
        }

` + service.slice(end);
  service = replaceRequired(service, `                watcher.client.removeLocationUpdates(watcher.locationCallback);
                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );`, `                stopWatcherLocation(watcher).addOnSuccessListener(ignored -> {
                    if (watchers.contains(watcher) && (!watcher.motionGated || reminderMoving)) startWatcherLocation(watcher);
                }).addOnFailureListener(error -> failWatcher(watcher, error));`);
  writeFileSync(servicePath, service);
}
let plugin = readFileSync(pluginPath, "utf8");
if (!plugin.includes("public void getMotionAuthorizationStatus(")) {
  plugin = replaceRequired(plugin, '                        alias = "location"\n                )', `                        alias = "location"
                ),
                @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activityRecognition")`);
  plugin = replaceRequired(plugin, '                call.getString("journeyId")\n        );', '                call.getString("journeyId"),\n                call.getBoolean("motionGated", false)\n        );');
  plugin = replaceRequired(plugin, "        call.setKeepAlive(true);", `        call.setKeepAlive(true);
        if (call.getBoolean("motionGated", false) && !motionPermissionGranted()) {
            call.reject("Allow Physical activity in Hecate's app permissions to enable discovery reminders.", "MOTION_NOT_AUTHORIZED");
            return;
        }`);
  plugin = replaceRequired(plugin, '                requestPermissionForAlias("location", call, "locationPermissionsCallback");', '                requestPermissionForAlias("location", call, "locationPermissionsCallback");\n                return;');
  plugin = replaceRequired(plugin, '                call.reject("Permission denied.", "NOT_AUTHORIZED");', '                call.reject("Permission denied.", "NOT_AUTHORIZED");\n                return;');
  plugin = replaceRequired(plugin, '            call.reject("Location services disabled.", "NOT_AUTHORIZED");', '            call.reject("Location services disabled.", "NOT_AUTHORIZED");\n            return;');
  const begin = plugin.indexOf('        if (call.getBoolean("stale", false)) {', plugin.indexOf("    private void locationPermissionsCallback"));
  const end = plugin.indexOf("\n    @PluginMethod()", begin);
  if (begin < 0 || end < 0) throw new Error("Android location permission callback changed; review watcher activation");
  plugin = plugin.slice(0, begin) + `        addWatcher(call);
        stoppedWithoutPermissions = false;
    }
` + plugin.slice(end);
  plugin = replaceRequired(plugin, `        service.removeWatcher(callbackId);
        PluginCall savedCall = getBridge().getSavedCall(callbackId);
        if (savedCall != null) {
            savedCall.release(getBridge());
        }
        call.resolve();`, `        service.removeWatcher(callbackId).addOnSuccessListener(ignored -> {
            PluginCall savedCall = getBridge().getSavedCall(callbackId);
            if (savedCall != null) savedCall.release(getBridge());
            call.resolve();
        }).addOnFailureListener(error -> call.reject("Could not remove native GPS and motion watcher: " + callbackId, error));`);
  const anchor = "    @PluginMethod()\n    public void openSettings(PluginCall call) {";
  plugin = replaceRequired(plugin, anchor, `    private boolean motionPermissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("activityRecognition") == PermissionState.GRANTED;
    }

    @PluginMethod public void getMotionAuthorizationStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = com.google.android.gms.common.GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext())
            == com.google.android.gms.common.ConnectionResult.SUCCESS;
        PermissionState permission = getPermissionState("activityRecognition");
        result.put("status", !available ? "unavailable" : motionPermissionGranted() ? "authorized"
            : permission == PermissionState.PROMPT ? "notDetermined" : "denied");
        call.resolve(result);
    }

    @PluginMethod public void requestMotionPermission(PluginCall call) {
        if (motionPermissionGranted()) { motionPermissionsCallback(call); return; }
        requestPermissionForAlias("activityRecognition", call, "motionPermissionsCallback");
    }

    @PermissionCallback private void motionPermissionsCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", motionPermissionGranted());
        call.resolve(result);
    }

    @PluginMethod public void removeAllWatchers(PluginCall call) {
        if (service == null) { call.reject("Location service is not connected."); return; }
        service.removeAllWatchers().addOnSuccessListener(ignored -> call.resolve())
            .addOnFailureListener(error -> call.reject("Could not remove all native GPS and motion watchers", error));
    }

` + anchor);
  plugin = replaceRequired(plugin, '            String journeyError = intent.getStringExtra("journeyError");', `            String watcherError = intent.getStringExtra("watcherError");
            if (watcherError != null) { call.reject(watcherError, intent.getStringExtra("watcherErrorCode")); return; }
            String journeyError = intent.getStringExtra("journeyError");`);
  writeFileSync(pluginPath, plugin);
}
plugin = readFileSync(pluginPath, "utf8");
if (!plugin.includes("private boolean motionAvailable()")) {
  plugin = replaceRequired(plugin, "    private boolean motionPermissionGranted() {", `    private boolean motionAvailable() {
        return com.google.android.gms.common.GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext())
            == com.google.android.gms.common.ConnectionResult.SUCCESS;
    }

    private boolean motionPermissionGranted() {`);
  plugin = replaceRequired(plugin, `        boolean available = com.google.android.gms.common.GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext())
            == com.google.android.gms.common.ConnectionResult.SUCCESS;`, "        boolean available = motionAvailable();");
  plugin = replaceRequired(plugin, "    @PluginMethod public void requestMotionPermission(PluginCall call) {", `    @PluginMethod public void requestMotionPermission(PluginCall call) {
        if (!motionAvailable()) { call.reject("Physical activity recognition is unavailable. Google Play services must be available for background discovery reminders.", "MOTION_UNAVAILABLE"); return; }`);
  writeFileSync(pluginPath, plugin);
}

service = readFileSync(servicePath, "utf8");
const visibleRevision = service.replace("public long locationRevision;", "public volatile long locationRevision;");
if (visibleRevision !== service) writeFileSync(servicePath, visibleRevision);

plugin = readFileSync(pluginPath, "utf8");
if (!plugin.includes("pendingCleanupCalls")) {
  plugin = replaceRequired(plugin, "    private BackgroundGeolocationService.LocalBinder service = null;", `    private volatile BackgroundGeolocationService.LocalBinder service = null;
    private final java.util.Queue<PluginCall> pendingCleanupCalls = new java.util.concurrent.ConcurrentLinkedQueue<>();`);
  plugin = replaceRequired(plugin, '        if (service == null) { call.reject("Location service is not connected."); return; }', `        if (service == null) {
            pendingCleanupCalls.add(call);
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (pendingCleanupCalls.remove(call)) call.reject("Location service did not connect within 10 seconds. Reopen Hecate and try again.");
            }, 10_000);
            if (service != null && pendingCleanupCalls.remove(call)) removeAllWatchers(call);
            return;
        }`);
  plugin = replaceRequired(plugin, "                        BackgroundGeolocation.this.service = (BackgroundGeolocationService.LocalBinder) binder;", `                        BackgroundGeolocation.this.service = (BackgroundGeolocationService.LocalBinder) binder;
                        PluginCall waiting;
                        while ((waiting = pendingCleanupCalls.poll()) != null) removeAllWatchers(waiting);`);
  plugin = replaceRequired(plugin, "                    public void onServiceDisconnected(ComponentName name) {\n                    }", "                    public void onServiceDisconnected(ComponentName name) {\n                        BackgroundGeolocation.this.service = null;\n                    }");
  writeFileSync(pluginPath, plugin);
}

service = readFileSync(servicePath, "utf8");
const oldMotionStart = service.indexOf("    @Override public int onStartCommand(Intent intent, int flags, int startId) {");
if (oldMotionStart !== -1) {
  const end = service.indexOf("    // Handles requests from the activity.", oldMotionStart);
  if (end === -1) throw new Error("Android motion service callback changed; review receiver migration");
  service = service.slice(0, oldMotionStart) + service.slice(end);
  writeFileSync(servicePath, service);
}
