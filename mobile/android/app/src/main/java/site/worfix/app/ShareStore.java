package site.worfix.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Photos shared into WORFIX from the gallery or the camera app (Share → WORFIX). They are read once, kept until
 * the page takes them (WorfixNative.takeShared) and handed over byte for byte, so the EXIF capture time survives.
 */
public final class ShareStore {
    public static final class SharedFile {
        public final String name, type, base64;
        SharedFile(String name, String type, String base64) { this.name = name; this.type = type; this.base64 = base64; }
    }

    private static final int MAX_FILES = 6;
    private static final int MAX_BYTES = 15 * 1024 * 1024;
    private static final List<SharedFile> pending = new ArrayList<>();

    /** True when the intent carried images that were kept. */
    public static boolean accept(Context c, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return false;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : legacyStream(intent);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class) : legacyStreams(intent);
            if (list != null) uris.addAll(list);
        } else return false;
        List<SharedFile> files = new ArrayList<>();
        ContentResolver cr = c.getContentResolver();
        for (Uri u : uris) {
            if (files.size() >= MAX_FILES) break;
            try (InputStream in = cr.openInputStream(u)) {
                if (in == null) continue;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n, total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_BYTES) break;
                    out.write(buf, 0, n);
                }
                if (total > MAX_BYTES) continue;
                String mime = cr.getType(u);
                if (mime == null || !mime.startsWith("image/")) mime = "image/jpeg";
                files.add(new SharedFile(nameOf(cr, u), mime, Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)));
            } catch (Exception ignored) { }
        }
        if (files.isEmpty()) return false;
        synchronized (pending) { pending.clear(); pending.addAll(files); }
        // Handled: Capacitor must not treat this intent as a link.
        intent.setAction(Intent.ACTION_MAIN);
        intent.setType(null);
        return true;
    }

    public static List<SharedFile> take() {
        synchronized (pending) {
            List<SharedFile> out = new ArrayList<>(pending);
            pending.clear();
            return out;
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri legacyStream(Intent i) { return i.getParcelableExtra(Intent.EXTRA_STREAM); }
    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> legacyStreams(Intent i) { return i.getParcelableArrayListExtra(Intent.EXTRA_STREAM); }

    private static String nameOf(ContentResolver cr, Uri u) {
        try (Cursor cur = cr.query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst()) {
                String n = cur.getString(0);
                if (n != null) return n;
            }
        } catch (Exception ignored) { }
        return "shared.jpg";
    }

    private ShareStore() { }
}
