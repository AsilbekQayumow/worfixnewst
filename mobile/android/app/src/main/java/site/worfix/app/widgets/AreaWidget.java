package site.worfix.app.widgets;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import site.worfix.app.R;

/** My area this month: its shape in my map colour, its size and my rank; or a button to walk the first loop. */
public class AreaWidget extends WorfixWidget {
    @Override
    protected RemoteViews render(Context c, JSONObject d, Bundle options) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_area);
        v.setTextViewText(R.id.a_label, str(d, "labels.area", c.getString(R.string.widget_area)));
        JSONObject area = d.optJSONObject("area");
        if (area == null) {
            v.setViewVisibility(R.id.a_body, View.GONE);
            v.setViewVisibility(R.id.a_empty_box, View.VISIBLE);
            v.setViewVisibility(R.id.a_rank, View.GONE);
            v.setTextViewText(R.id.a_empty, str(d, "labels.noArea", ""));
            v.setTextViewText(R.id.a_walk, str(d, "labels.walk", ""));
            v.setOnClickPendingIntent(R.id.w_root, open(c, "/app/map", 401));
            v.setOnClickPendingIntent(R.id.a_walk_btn, open(c, "/app/map?walk=1", 402));
            return v;
        }
        v.setViewVisibility(R.id.a_body, View.VISIBLE);
        v.setViewVisibility(R.id.a_empty_box, View.GONE);
        v.setTextViewText(R.id.a_area, area.optString("text", ""));
        String rank = area.optString("rankText", "");
        v.setViewVisibility(R.id.a_rank, rank.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.a_rank, rank);
        int color;
        try { color = Color.parseColor(d.optString("color", "#1fa84a")); } catch (Exception e) { color = c.getColor(R.color.worfix_green); }
        float density = c.getResources().getDisplayMetrics().density;
        int w = Math.max(120, widthDp(options, 160) - 24), h = Math.max(80, heightDp(options, 160) - 84);
        boolean night = (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        v.setImageViewBitmap(R.id.a_map, draw(area.optJSONArray("rings"), color, Math.round(w * density), Math.round(h * density), density, night));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/app/map", 403));
        return v;
    }

    /** The rings (unit box, y down) drawn centred on a soft dotted map. Bitmap capped at 720 px wide. */
    static Bitmap draw(JSONArray rings, int color, int w, int h, float density, boolean night) {
        float scale = Math.min(1f, 720f / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        density *= scale;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(night ? 0x22FFFFFF : 0x1A14251B);
        float step = 12 * density;
        for (float y = step / 2; y < h; y += step) for (float x = step / 2; x < w; x += step) cv.drawCircle(x, y, 1.2f * density, dot);
        if (rings == null || rings.length() == 0) return bmp;
        float pad = 10 * density, size = Math.min(w, h) - 2 * pad;
        float ox = (w - size) / 2f, oy = (h - size) / 2f;
        Path path = new Path();
        path.setFillType(Path.FillType.EVEN_ODD);
        for (int i = 0; i < rings.length(); i++) {
            JSONArray ring = rings.optJSONArray(i);
            if (ring == null || ring.length() < 3) continue;
            for (int j = 0; j < ring.length(); j++) {
                JSONArray p = ring.optJSONArray(j);
                if (p == null) continue;
                float x = ox + (float) p.optDouble(0) * size, y = oy + (float) p.optDouble(1) * size;
                if (j == 0) path.moveTo(x, y); else path.lineTo(x, y);
            }
            path.close();
        }
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        fill.setColor((color & 0x00FFFFFF) | 0x59000000);
        cv.drawPath(path, fill);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(3 * density);
        line.setStrokeJoin(Paint.Join.ROUND);
        line.setColor(color);
        cv.drawPath(path, line);
        return bmp;
    }
}
