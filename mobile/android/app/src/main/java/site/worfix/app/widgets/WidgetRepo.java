package site.worfix.app.widgets;

import android.Manifest;
import android.annotation.SuppressLint;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The data behind every widget: one JSON from https://worfix.site/.netlify/functions/widget (see
 * web/src/lib/server/widget.ts), fetched with this phone's widget token and cached, so widgets draw at once
 * and refresh in the background.
 */
public final class WidgetRepo {
    public static final String BASE = "https://worfix.site";
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static volatile long lastFetch = 0;

    static final Class<?>[] PROVIDERS = { TreeWidget.class, StreakWidget.class, MissionWidget.class, AreaWidget.class, PulseWidget.class };

    public static SharedPreferences prefs(Context c) { return c.getSharedPreferences("worfix_widgets", Context.MODE_PRIVATE); }

    /** The cached data, or null when signed out / not loaded yet. */
    public static JSONObject cached(Context c) {
        String s = prefs(c).getString("json", null);
        if (s == null) return null;
        try { return new JSONObject(s); } catch (Exception e) { return null; }
    }

    public static boolean signedIn(Context c) { return prefs(c).contains("token"); }

    /** Fetches fresh data (at most every 30 s) and redraws every widget. */
    public static void refreshAsync(Context context) {
        Context c = context.getApplicationContext();
        if (!signedIn(c) || !hasWidgets(c)) return;
        IO.execute(() -> { fetch(c); updateAll(c); });
    }

    /** Blocking fetch (call off the main thread). True when new data arrived. */
    public static boolean fetch(Context c) {
        String token = prefs(c).getString("token", null);
        if (token == null) return false;
        long now = System.currentTimeMillis();
        if (now - lastFetch < 30_000) return false;
        lastFetch = now;
        HttpURLConnection con = null;
        try {
            StringBuilder url = new StringBuilder(BASE + "/.netlify/functions/widget");
            Location loc = lastLocation(c);
            if (loc != null) url.append(String.format(Locale.US, "?lat=%.5f&lng=%.5f", loc.getLatitude(), loc.getLongitude()));
            con = (HttpURLConnection) new URL(url.toString()).openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(10000);
            con.setRequestProperty("x-widget-token", token);
            con.setRequestProperty("accept", "application/json");
            int code = con.getResponseCode();
            if (code == 401) { prefs(c).edit().remove("token").remove("json").apply(); return true; }
            if (code != 200) return false;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            new JSONObject(sb.toString()); // must parse
            prefs(c).edit().putString("json", sb.toString()).putLong("at", now).apply();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    @SuppressLint("MissingPermission")
    private static Location lastLocation(Context c) {
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null;
        LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
        Location best = null;
        for (String p : new String[]{ LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER }) {
            try {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            } catch (Exception ignored) { }
        }
        return best;
    }

    static boolean hasWidgets(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : PROVIDERS) if (m.getAppWidgetIds(new ComponentName(c, k)).length > 0) return true;
        return false;
    }

    /** Redraws every placed widget from the cache. */
    public static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : PROVIDERS) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, k));
            if (ids.length == 0) continue;
            try {
                WorfixWidget w = (WorfixWidget) k.getDeclaredConstructor().newInstance();
                for (int id : ids) w.draw(c, m, id);
            } catch (Exception ignored) { }
        }
    }

    private WidgetRepo() { }
}
