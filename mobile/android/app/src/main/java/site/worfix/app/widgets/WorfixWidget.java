package site.worfix.app.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import site.worfix.app.MainActivity;
import site.worfix.app.R;

/**
 * Base of the five WORFIX widgets: draws from the cached data right away, then fetches fresh data in the
 * background (Android asks every 30 minutes; the app also refreshes when you leave it or data changes).
 */
public abstract class WorfixWidget extends AppWidgetProvider {

    /** Builds the widget for the data; data is null when signed out or not loaded yet. */
    protected abstract RemoteViews render(Context c, JSONObject data, Bundle options);

    void draw(Context c, AppWidgetManager m, int id) {
        JSONObject data = WidgetRepo.signedIn(c) ? WidgetRepo.cached(c) : null;
        RemoteViews v = data != null ? render(c, data, m.getAppWidgetOptions(id)) : signedOut(c);
        m.updateAppWidget(id, v);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) draw(context, manager, id);
        if (!WidgetRepo.signedIn(context)) return;
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                if (WidgetRepo.fetch(context.getApplicationContext())) WidgetRepo.updateAll(context);
            } finally {
                pending.finish();
            }
        }).start();
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        draw(c, m, id);
    }

    protected RemoteViews signedOut(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_signed_out);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/app", 900));
        return v;
    }

    /** Opens a page of the app (handled by the website router through Capacitor's appUrlOpen). */
    protected static PendingIntent open(Context c, String path, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetRepo.BASE + path), c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Widget width in dp (the smallest the launcher may show). */
    protected static int widthDp(Bundle options, int fallback) {
        return options == null ? fallback : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, fallback);
    }
    protected static int heightDp(Bundle options, int fallback) {
        return options == null ? fallback : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, fallback);
    }

    protected static String str(JSONObject o, String path, String fallback) {
        String[] parts = path.split("\\.");
        JSONObject cur = o;
        for (int i = 0; i < parts.length - 1; i++) {
            cur = cur.optJSONObject(parts[i]);
            if (cur == null) return fallback;
        }
        String v = cur.optString(parts[parts.length - 1], "");
        return v.isEmpty() || "null".equals(v) ? fallback : v;
    }
}
