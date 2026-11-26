package site.worfix.app;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.List;

import site.worfix.app.widgets.WidgetRepo;

/**
 * WorfixNative: what the website needs from the phone. The same methods exist on iOS; the page side is
 * web/src/lib/native/index.ts.
 */
@CapacitorPlugin(
    name = "WorfixNative",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }),
        // v6: the step counter for walk fair play (a car moves without steps)
        @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION })
    }
)
public class WorfixNativePlugin extends Plugin {
    private static WorfixNativePlugin instance;

    @Override
    public void load() { instance = this; }

    /** MainActivity: new photos were shared into the app while it was open. */
    static void sharedArrived() {
        if (instance != null) instance.notifyListeners("shared", new JSObject());
    }

    /* ───────────── info ───────────── */

    @PluginMethod
    public void info(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            r.put("version", p.versionName);
            r.put("build", String.valueOf(PackageInfoCompat.getLongVersionCode(p)));
        } catch (Exception e) {
            r.put("version", "1.0");
            r.put("build", "1");
        }
        SharedPreferences w = WidgetRepo.prefs(c);
        r.put("biometric", Biometrics.kind(c));
        r.put("hasLogin", Biometrics.hasLogin(c));
        r.put("hasSession", w.contains("token"));
        r.put("sessionUser", w.getString("userId", null));
        // Push works once google-services.json is in the build (it adds this resource).
        r.put("push", c.getResources().getIdentifier("google_app_id", "string", c.getPackageName()) != 0);
        call.resolve(r);
    }

    /* ───────────── widgets ───────────── */

    @PluginMethod
    public void setSession(PluginCall call) {
        String token = call.getString("token"), userId = call.getString("userId");
        if (token == null || userId == null) { call.reject("token and userId are required"); return; }
        WidgetRepo.prefs(getContext()).edit().putString("token", token).putString("userId", userId).remove("json").apply();
        WidgetRepo.refreshAsync(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        SharedPreferences p = WidgetRepo.prefs(getContext());
        String token = p.getString("token", null);
        p.edit().clear().apply();
        WidgetRepo.updateAll(getContext());
        JSObject r = new JSObject();
        r.put("token", token);
        call.resolve(r);
    }

    @PluginMethod
    public void refreshWidgets(PluginCall call) {
        WidgetRepo.refreshAsync(getContext());
        call.resolve();
    }

    /* ───────────── the walk ───────────── */

    @PluginMethod
    public void startWalk(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterLocation");
            return;
        }
        startWalkNow(call);
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("location permission denied"); return; }
        startWalkNow(call);
    }

    private void startWalkNow(PluginCall call) {
        // The live panel needs the notification permission (Android 13+); ask once, start either way.
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        launchWalk(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) { launchWalk(call); }

    private void launchWalk(PluginCall call) {
        PermissionState steps = getPermissionState("activity");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && steps != PermissionState.GRANTED && steps != PermissionState.DENIED) {
            requestPermissionForAlias("activity", call, "afterActivity");
            return;
        }
        launchWalkNow(call);
    }

    @PermissionCallback
    private void afterActivity(PluginCall call) { launchWalkNow(call); }

    private void launchWalkNow(PluginCall call) {
        JSObject labels = call.getObject("labels", new JSObject());
        WalkService.start(getContext(), call.getString("color", "#1fa84a"), labels.toString(), Boolean.TRUE.equals(call.getBoolean("resume", false)));
        call.resolve();
    }

    @PluginMethod
    public void walkPoints(PluginCall call) {
        Context c = getContext();
        int from = call.getInt("from", 0);
        List<WalkStore.Point> list = WalkStore.since(c, from);
        JSArray arr = new JSArray();
        for (WalkStore.Point p : list) {
            JSObject o = new JSObject();
            o.put("lat", p.lat);
            o.put("lng", p.lng);
            o.put("t", p.t);
            o.put("acc", p.acc);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("points", arr);
        r.put("total", WalkStore.size(c));
        r.put("running", WalkStore.running);
        // v6: steps since the walk started (null when the phone has no step counter or no permission) and the mock flag
        long steps = WalkStore.steps();
        if (steps >= 0) r.put("steps", steps); else r.put("steps", JSONObject.NULL);
        r.put("mock", WalkStore.mock);
        call.resolve(r);
    }

    @PluginMethod
    public void stopWalk(PluginCall call) {
        WalkService.stop(getContext(), Boolean.TRUE.equals(call.getBoolean("clear", false)));
        call.resolve();
    }

    /* ───────────── biometrics ───────────── */

    private String[] texts(PluginCall call) {
        return new String[]{ call.getString("title", "WORFIX"), call.getString("reason", ""), call.getString("cancel", "Cancel") };
    }

    @PluginMethod
    public void verifyBiometric(PluginCall call) {
        String[] t = texts(call);
        Biometrics.verify(getActivity(), t[0], t[1], t[2], new Biometrics.Done() {
            @Override public void ok(String v) { JSObject r = new JSObject(); r.put("ok", true); call.resolve(r); }
            @Override public void fail(String reason) { JSObject r = new JSObject(); r.put("ok", false); call.resolve(r); }
        });
    }

    @PluginMethod
    public void saveLogin(PluginCall call) {
        String email = call.getString("email"), password = call.getString("password");
        if (email == null || password == null) { call.reject("email and password are required"); return; }
        String[] t = texts(call);
        Biometrics.saveLogin(getActivity(), email, password, t[0], t[1], t[2], new Biometrics.Done() {
            @Override public void ok(String v) { JSObject r = new JSObject(); r.put("ok", true); call.resolve(r); }
            @Override public void fail(String reason) { call.reject(reason == null ? "failed" : reason); }
        });
    }

    @PluginMethod
    public void loadLogin(PluginCall call) {
        String[] t = texts(call);
        Biometrics.loadLogin(getActivity(), t[0], t[1], t[2], new Biometrics.Done() {
            @Override public void ok(String json) {
                try {
                    JSONObject o = new JSONObject(json);
                    JSObject r = new JSObject();
                    r.put("email", o.getString("email"));
                    r.put("password", o.getString("password"));
                    call.resolve(r);
                } catch (Exception e) { call.reject("unreadable"); }
            }
            @Override public void fail(String reason) { call.reject(reason == null ? "failed" : reason); }
        });
    }

    @PluginMethod
    public void clearLogin(PluginCall call) {
        Biometrics.clearLogin(getContext());
        call.resolve();
    }

    /* ───────────── Share → WORFIX ───────────── */

    @PluginMethod
    public void takeShared(PluginCall call) {
        JSArray arr = new JSArray();
        for (ShareStore.SharedFile f : ShareStore.take()) {
            JSObject o = new JSObject();
            o.put("name", f.name);
            o.put("type", f.type);
            o.put("data", f.base64);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("files", arr);
        call.resolve(r);
    }

    /* ───────────── images out: share sheet and gallery ───────────── */

    private static byte[] decode(String dataUrl) {
        int comma = dataUrl.indexOf(',');
        return Base64.decode(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl, Base64.DEFAULT);
    }
    private static String mimeOf(String dataUrl) {
        return dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        if (dataUrl == null) { call.reject("dataUrl is required"); return; }
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            String mime = mimeOf(dataUrl);
            File f = new File(dir, "worfix." + (mime.equals("image/jpeg") ? "jpg" : "png"));
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(decode(dataUrl)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TEXT, call.getString("text", ""))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", "WORFIX"));
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "afterStorage");
            return;
        }
        saveImageNow(call);
    }

    @PermissionCallback
    private void afterStorage(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) { call.reject("storage permission denied"); return; }
        saveImageNow(call);
    }

    private void saveImageNow(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        String name = call.getString("name", "worfix.png");
        if (dataUrl == null) { call.reject("dataUrl is required"); return; }
        try {
            byte[] bytes = decode(dataUrl);
            String mime = mimeOf(dataUrl);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, mime);
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/WORFIX");
                Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException("no gallery");
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("no gallery");
                    out.write(bytes);
                }
            } else {
                Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                //noinspection deprecation
                MediaStore.Images.Media.insertImage(getContext().getContentResolver(), bmp, name, "WORFIX");
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Context c = getContext();
        Intent i;
        if (Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
        else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
        call.resolve();
    }
}
