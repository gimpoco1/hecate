package com.gimpoco.hecate;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppIconDeviceTest {
    @Test
    public void switchingIconsPreservesOneLauncherAndTheMainActivity() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String previous = AppIconPlugin.currentIcon(context);
        PackageManager manager = context.getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.getPackageName());
        try {
            AppIconPlugin.selectIcon(context, "dark");
            assertEquals("dark", AppIconPlugin.currentIcon(context));
            List<ResolveInfo> darkEntries = manager.queryIntentActivities(launcher, 0);
            assertEquals(1, darkEntries.size());
            assertEquals("com.gimpoco.hecate.DarkIcon", darkEntries.get(0).activityInfo.name);
            assertTrue(manager.getActivityInfo(new ComponentName(context, MainActivity.class), 0).enabled);
            Intent auth = new Intent(Intent.ACTION_VIEW, Uri.parse("hecate://auth/callback"))
                .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.getPackageName());
            ResolveInfo authActivity = manager.resolveActivity(auth, PackageManager.MATCH_DEFAULT_ONLY);
            assertEquals(MainActivity.class.getName(), authActivity.activityInfo.name);

            AppIconPlugin.selectIcon(context, "original");
            assertEquals("original", AppIconPlugin.currentIcon(context));
            List<ResolveInfo> originalEntries = manager.queryIntentActivities(launcher, 0);
            assertEquals(1, originalEntries.size());
            assertEquals("com.gimpoco.hecate.OriginalIcon", originalEntries.get(0).activityInfo.name);
        } finally {
            AppIconPlugin.selectIcon(context, previous);
        }
    }
}
