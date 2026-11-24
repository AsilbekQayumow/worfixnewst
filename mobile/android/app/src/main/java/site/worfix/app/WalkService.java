package site.worfix.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.widget.RemoteViews;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Records the walk with the phone's GPS while the screen is off or the app is in the background, and keeps a
 * live panel in the notification shade and on the lock screen: distance walked, the area so far and how far the
 * start is. When the loop closes it buzzes once and asks to open the app to claim the area.
 */
public class WalkService extends Service implements LocationListener {
    public static final String ACTION_START = "site.worfix.app.walk.START";
    public static final String ACTION_STOP = "site.worfix.app.walk.STOP";
    public static final String EXTRA_RESUME = "resume";

    static final String CHANNEL = "worfix_walk";
    static final String CHANNEL_ALERTS = "worfix_walk_alerts";
    static final int NOTIFICATION_ID = 4101;
    static final int CLOSED_ID = 4102;
    static final String PREFS = "worfix_walk";

    private LocationManager lm;
    private long lastPanel = 0;
    private boolean closedAlerted = false;
    private long startedAt = 0;

    public static void start(Context c, String color, String labelsJson, boolean resume) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("color", color).putString("labels", labelsJson).apply();
        Intent i = new Intent(c, WalkService.class).setAction(ACTION_START).putExtra(EXTRA_RESUME, resume);
        ContextCompat.startForegroundService(c, i);
    }

    public static void stop(Context c, boolean clear) {
        if (clear) WalkStore.clear(c);
        WalkStore.running = false;
        c.stopService(new Intent(c, WalkService.class));
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        nm.cancel(CLOSED_ID);
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            stopRecording();
            return START_NOT_STICKY;
        }
        boolean resume = intent == null || intent.getBooleanExtra(EXTRA_RESUME, true);
        if (!resume) { WalkStore.clear(this); closedAlerted = false; }
        else WalkStore.load(this);
        java.util.List<WalkStore.Point> all = WalkStore.since(this, 0);
        startedAt = all.isEmpty() ? System.currentTimeMillis() : all.get(0).t;
        channels();
        Notification n = panel();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
        } catch (RuntimeException e) {
            // No location permission or not allowed to start from the background: nothing to record.
            stopSelf();
            return START_NOT_STICKY;
        }
        WalkStore.running = true;
        listen();
        return START_STICKY;
    }

    @SuppressLint("MissingPermission")
    private void listen() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopRecording();
            return;
        }
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000, 0, this, Looper.getMainLooper());
    }

    private void stopRecording() {
        WalkStore.running = false;
        if (lm != null) try { lm.removeUpdates(this); } catch (Exception ignored) { }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        WalkStore.running = false;
        if (lm != null) try { lm.removeUpdates(this); } catch (Exception ignored) { }
        super.onDestroy();
    }

    @Override
    public void onLocationChanged(@NonNull Location loc) {
        float acc = loc.hasAccuracy() ? loc.getAccuracy() : 99;
        // Network fixes are only kept while there is no GPS at all (they are usually too rough to count).
        if (LocationManager.NETWORK_PROVIDER.equals(loc.getProvider()) && acc > WalkStore.MAX_ACCURACY_M) return;
        WalkStore.add(this, loc.getLatitude(), loc.getLongitude(), loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis(), acc);
        long now = System.currentTimeMillis();
        if (now - lastPanel < 1000) return;
        lastPanel = now;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(NOTIFICATION_ID, panel());
    }

    // Older Android versions call these; nothing to do.
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(@NonNull String provider) { }
    @Override public void onProviderDisabled(@NonNull String provider) { }

    /* ───────────── the live panel ───────────── */

    private JSONObject labels() {
        try { return new JSONObject(getSharedPreferences(PREFS, MODE_PRIVATE).getString("labels", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }
    private String label(JSONObject l, String key, int fallback) {
        String v = l.optString(key, "");
        return v.isEmpty() ? getString(fallback) : v;
    }

    private void channels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        JSONObject l = labels();
        NotificationChannel walk = new NotificationChannel(CHANNEL, label(l, "channel", R.string.walk_channel), NotificationManager.IMPORTANCE_LOW);
        walk.setShowBadge(false);
        walk.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(walk);
        NotificationChannel alerts = new NotificationChannel(CHANNEL_ALERTS, getString(R.string.walk_alerts), NotificationManager.IMPORTANCE_HIGH);
        alerts.enableVibration(true);
        alerts.setVibrationPattern(new long[]{0, 120, 80, 220});
        alerts.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alerts);
    }

    static PendingIntent openMap(Context c, int code) {
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("https://worfix.site/app/map"), c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String meters(double m) {
        if (m < 1000) return String.format(Locale.US, "%d m", Math.round(m));
        return String.format(Locale.US, "%.2f km", m / 1000);
    }
    static String area(double m2) {
        if (m2 >= 1_000_000) return String.format(Locale.US, "%.2f km²", m2 / 1_000_000);
        long v = Math.round(m2 / 10) * 10;
        return String.format(Locale.US, "%,d m²", v).replace(',', ' ');
    }

    private Notification panel() {
        JSONObject l = labels();
        WalkStore.Stats s = WalkStore.stats(this);
        String title = label(l, "title", R.string.walk_title);
        String hint;
        if (s.kept == 0) hint = getString(R.string.walk_gps);
        else if (s.closed) hint = label(l, "closed", R.string.walk_closed);
        else if (s.toStartM >= 0 && s.pathM >= 60) hint = l.optString("toStart", "{d}").replace("{d}", meters(s.toStartM));
        else hint = label(l, "hint", R.string.walk_hint);

        int color;
        try { color = Color.parseColor(getSharedPreferences(PREFS, MODE_PRIVATE).getString("color", "#1fa84a")); }
        catch (Exception e) { color = ContextCompat.getColor(this, R.color.worfix_green); }

        RemoteViews small = new RemoteViews(getPackageName(), R.layout.walk_panel);
        RemoteViews big = new RemoteViews(getPackageName(), R.layout.walk_panel_big);
        for (RemoteViews v : new RemoteViews[]{small, big}) {
            v.setTextViewText(R.id.walk_title, title);
            v.setTextViewText(R.id.walk_distance, meters(s.pathM));
            v.setTextViewText(R.id.walk_area, s.kept >= 3 ? area(s.areaM2) : "—");
            v.setTextViewText(R.id.walk_distance_label, label(l, "distance", R.string.walk_distance));
            v.setTextViewText(R.id.walk_area_label, label(l, "area", R.string.walk_area));
            v.setTextViewText(R.id.walk_hint, hint);
        }
        if (s.closed && !closedAlerted) {
            closedAlerted = true;
            Notification alert = new NotificationCompat.Builder(this, CHANNEL_ALERTS)
                .setSmallIcon(R.drawable.ic_stat_worfix)
                .setColor(ContextCompat.getColor(this, R.color.worfix_green))
                .setContentTitle(title)
                .setContentText(label(l, "closed", R.string.walk_closed))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openMap(this, 2))
                .build();
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(CLOSED_ID, alert);
        }

        PendingIntent stop = PendingIntent.getService(this, 3, new Intent(this, WalkService.class).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_worfix)
            .setColor(color)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setContentTitle(title)
            .setContentText(meters(s.pathM) + " · " + (s.kept >= 3 ? area(s.areaM2) : "—"))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setWhen(startedAt)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openMap(this, 1))
            .addAction(0, label(l, "stop", R.string.walk_stop), stop)
            .build();
    }
}
