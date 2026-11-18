package com.gimpoco.hecate;

import android.system.ErrnoException;
import android.system.Os;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

@CapacitorPlugin(name = "PersistentStorage")
public class PersistentStoragePlugin extends Plugin {
    private File entry(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty() || key.getBytes(StandardCharsets.UTF_8).length > 180) {
            throw new IllegalArgumentException("A valid private storage key is required.");
        }
        String name = Base64.encodeToString(key.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP).replace('/', '_');
        return new File(getContext().getNoBackupFilesDir(), name);
    }

    @PluginMethod public void read(PluginCall call) {
        try {
            File file = entry(call);
            JSObject result = new JSObject();
            String stored = file.exists() ? new String(new AtomicFile(file).readFully(), StandardCharsets.UTF_8) : "";
            result.put("value", stored.isEmpty() ? JSONObject.NULL : stored.substring(1));
            call.resolve(result);
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Could not read Hecate's private storage.", error);
        }
    }

    @PluginMethod public void write(PluginCall call) {
        try {
            File file = entry(call);
            String value = call.getString("value");
            if (value == null && call.getData().opt("value") != JSONObject.NULL) {
                throw new IllegalArgumentException("A private storage value is required.");
            }
            // An empty file is a tombstone so removal uses the same atomic commit as a write.
            File staging = new File(file.getPath() + ".staged");
            try (FileOutputStream output = new FileOutputStream(staging)) {
                output.write(value == null ? new byte[0] : ("1" + value).getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
            }
            Os.rename(staging.getPath(), file.getPath());
            call.resolve();
        } catch (IOException | IllegalArgumentException | ErrnoException error) {
            call.reject("Could not update Hecate's private storage.", error);
        }
    }
}
