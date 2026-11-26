package site.worfix.app;

import android.content.Context;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * The points of the walk being recorded. Kept in memory and appended to a small file, so a walk survives the
 * app being closed by the system; the page pulls them with WorfixNative.walkPoints({ from }).
 *
 * The numbers for the live panel follow the site's rules (web/src/lib/domain/territory.ts): fixes worse than
 * 35 m are ignored, stretches faster than 18 km/h are skipped, the loop is closed when you are back within 35 m
 * of the start after at least 200 m and 8 good fixes.
 */
public final class WalkStore {
    public static final double MAX_ACCURACY_M = 35;
    public static final double MAX_SPEED_KMH = 18;
    public static final double AUTO_CLOSE_M = 35;
    public static final double MIN_PATH_M = 200;

    public static final class Point {
        public final double lat, lng;
        public final long t;
        public final double acc;
        Point(double lat, double lng, long t, double acc) { this.lat = lat; this.lng = lng; this.t = t; this.acc = acc; }
    }

    private static final List<Point> points = new ArrayList<>();
    private static boolean loaded = false;
    public static volatile boolean running = false;
    /** v6: any fix of this walk came from a mock-location app */
    public static volatile boolean mock = false;
    /** v6: step counter readings (the sensor counts since boot): first and latest of this walk, -1 = none */
    public static volatile long stepsFirst = -1;
    public static volatile long stepsLast = -1;
    public static long steps() { return stepsFirst >= 0 && stepsLast >= stepsFirst ? stepsLast - stepsFirst : -1; }

    private static File file(Context c) { return new File(c.getFilesDir(), "walk.csv"); }

    public static synchronized void load(Context c) {
        if (loaded) return;
        loaded = true;
        points.clear();
        File f = file(c);
        if (!f.exists()) return;
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = r.readLine()) != null) {
                String[] p = line.split(",");
                if (p.length < 4) continue;
                points.add(new Point(Double.parseDouble(p[0]), Double.parseDouble(p[1]), Long.parseLong(p[2]), Double.parseDouble(p[3])));
            }
        } catch (IOException | NumberFormatException ignored) { }
        // A walk older than 6 hours is not picked up again (same as the page).
        if (!points.isEmpty() && System.currentTimeMillis() - points.get(0).t > 6L * 3_600_000) clear(c);
    }

    public static synchronized void add(Context c, double lat, double lng, long t, double acc) {
        load(c);
        points.add(new Point(lat, lng, t, acc));
        try (FileWriter w = new FileWriter(file(c), true)) {
            w.write(lat + "," + lng + "," + t + "," + acc + "\n");
        } catch (IOException ignored) { }
    }

    public static synchronized void clear(Context c) {
        points.clear();
        mock = false;
        stepsFirst = -1;
        stepsLast = -1;
        loaded = true;
        //noinspection ResultOfMethodCallIgnored
        file(c).delete();
    }

    public static synchronized List<Point> since(Context c, int from) {
        load(c);
        if (from < 0) from = 0;
        if (from >= points.size()) return new ArrayList<>();
        return new ArrayList<>(points.subList(from, points.size()));
    }

    public static synchronized int size(Context c) { load(c); return points.size(); }

    /* ───────────── the numbers on the panel ───────────── */

    public static double distanceM(double lat1, double lng1, double lat2, double lng2) {
        double r = 6_371_000, toRad = Math.PI / 180;
        double dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public static final class Stats {
        public double pathM, areaM2, toStartM = -1;
        public int kept;
        public boolean closed;
    }

    public static synchronized Stats stats(Context c) {
        load(c);
        Stats s = new Stats();
        List<Point> kept = new ArrayList<>();
        for (Point p : points) {
            if (p.acc > MAX_ACCURACY_M) continue;
            if (!kept.isEmpty()) {
                Point q = kept.get(kept.size() - 1);
                double d = distanceM(q.lat, q.lng, p.lat, p.lng);
                double hours = Math.max(1, p.t - q.t) / 3_600_000.0;
                if (d / 1000 / hours > MAX_SPEED_KMH && d > 25) continue; // a vehicle: skip the stretch
                if (d < 2) continue; // standing still
                s.pathM += d;
            }
            kept.add(p);
        }
        s.kept = kept.size();
        if (kept.size() >= 2) {
            Point a = kept.get(0), b = kept.get(kept.size() - 1);
            s.toStartM = distanceM(a.lat, a.lng, b.lat, b.lng);
            s.closed = s.pathM >= MIN_PATH_M && kept.size() >= 8 && s.toStartM <= AUTO_CLOSE_M;
        }
        if (kept.size() >= 3) {
            // Shoelace on a local flat projection, as if the loop were closed now.
            Point o = kept.get(0);
            double k = Math.cos(o.lat * Math.PI / 180), mPerDeg = 111_320;
            double sum = 0;
            for (int i = 0; i < kept.size(); i++) {
                Point p = kept.get(i), q = kept.get((i + 1) % kept.size());
                double x1 = (p.lng - o.lng) * mPerDeg * k, y1 = (p.lat - o.lat) * mPerDeg;
                double x2 = (q.lng - o.lng) * mPerDeg * k, y2 = (q.lat - o.lat) * mPerDeg;
                sum += x1 * y2 - x2 * y1;
            }
            s.areaM2 = Math.abs(sum) / 2;
        }
        return s;
    }

    private WalkStore() { }
}
