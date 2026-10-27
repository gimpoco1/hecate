package com.gimpoco.hecate;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;

@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    @PluginMethod
    public void getState(PluginCall call) {
        try {
            call.resolve(iconState(getContext()));
        } catch (IllegalStateException | IllegalArgumentException | SecurityException error) {
            call.reject("Could not read the Android launcher icon. Reopen Appearance and try again.", null, error);
        }
    }

    @PluginMethod
    public void setIcon(PluginCall call) {
        String icon = call.getString("icon");
        if (!"original".equals(icon) && !"dark".equals(icon)) {
            call.reject("App icon must be original or dark.");
            return;
        }
        try {
            selectIcon(getContext(), icon);
            call.resolve(iconState(getContext()));
        } catch (IllegalStateException | IllegalArgumentException | SecurityException error) {
            call.reject("Android could not change the launcher icon. Please try again.", null, error);
        }
    }

    private static ComponentName originalComponent(Context context) {
        return new ComponentName(context.getPackageName(), "com.gimpoco.hecate.OriginalIcon");
    }

    private static ComponentName darkComponent(Context context) {
        return new ComponentName(context.getPackageName(), "com.gimpoco.hecate.DarkIcon");
    }

    static String currentIcon(Context context) {
        PackageManager manager = context.getPackageManager();
        int original = manager.getComponentEnabledSetting(originalComponent(context));
        int dark = manager.getComponentEnabledSetting(darkComponent(context));
        boolean originalEnabled = original == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT || original == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
        boolean darkEnabled = dark == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
        if (originalEnabled == darkEnabled) throw new IllegalStateException("Exactly one Hecate launcher icon must be enabled.");
        return darkEnabled ? "dark" : "original";
    }

    /** Only launcher aliases change; the activity used by sign-in and active journeys stays enabled. */
    static void selectIcon(Context context, String icon) {
        if (!"original".equals(icon) && !"dark".equals(icon)) throw new IllegalArgumentException("App icon must be original or dark.");
        PackageManager manager = context.getPackageManager();
        ComponentName selected = "dark".equals(icon) ? darkComponent(context) : originalComponent(context);
        ComponentName other = "dark".equals(icon) ? originalComponent(context) : darkComponent(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            manager.setComponentEnabledSettings(Arrays.asList(
                new PackageManager.ComponentEnabledSetting(selected, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP),
                new PackageManager.ComponentEnabledSetting(other, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
            ));
        } else {
            // Enable first so older Android versions always retain a working launcher entry.
            manager.setComponentEnabledSetting(selected, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            manager.setComponentEnabledSetting(other, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }

    private static JSObject iconState(Context context) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("icon", currentIcon(context));
        return result;
    }
}
