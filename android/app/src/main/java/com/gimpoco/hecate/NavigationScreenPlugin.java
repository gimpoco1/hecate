package com.gimpoco.hecate;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NavigationScreen")
public class NavigationScreenPlugin extends Plugin {
    private boolean navigationActive = false;
    private boolean activityResumed = false;

    private void updateScreenFlag() {
        if (navigationActive && activityResumed) {
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    protected void handleOnResume() {
        activityResumed = true;
        updateScreenFlag();
    }

    @Override
    protected void handleOnPause() {
        activityResumed = false;
        updateScreenFlag();
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            navigationActive = true;
            updateScreenFlag();
            call.resolve();
        });
    }

    @PluginMethod
    public void allowSleep(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            navigationActive = false;
            updateScreenFlag();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        );
    }
}
