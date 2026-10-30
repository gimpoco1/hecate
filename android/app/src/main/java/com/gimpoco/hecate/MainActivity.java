package com.gimpoco.hecate;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JourneyActivityPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(NavigationScreenPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
