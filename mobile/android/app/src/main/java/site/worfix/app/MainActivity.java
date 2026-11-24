package site.worfix.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * The WORFIX app: a Capacitor shell around https://worfix.site (see capacitor.config.json), plus our own
 * WorfixNative plugin (widgets, the walk panel, biometrics, Share → WORFIX).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorfixNativePlugin.class);
        ShareStore.accept(this, getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        if (ShareStore.accept(this, intent)) WorfixNativePlugin.sharedArrived();
        super.onNewIntent(intent);
    }

    @Override
    public void onPause() {
        super.onPause();
        // The widgets show the freshest numbers once the user leaves the app.
        site.worfix.app.widgets.WidgetRepo.refreshAsync(this);
    }
}
