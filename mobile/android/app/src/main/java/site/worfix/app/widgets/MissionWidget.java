package site.worfix.app.widgets;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import site.worfix.app.R;

/** The nearest new mission: its kind, title, distance and time, and a Join button. */
public class MissionWidget extends WorfixWidget {
    private static int icon(String category) {
        switch (category) {
            case "environment": return R.drawable.ic_w_leaf;
            case "water": return R.drawable.ic_w_droplet;
            case "animals": return R.drawable.ic_w_paw;
            case "education": return R.drawable.ic_w_book;
            case "recycling": return R.drawable.ic_w_recycle;
            default: return R.drawable.ic_w_hands;
        }
    }

    @Override
    protected RemoteViews render(Context c, JSONObject d, Bundle options) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mission);
        v.setTextViewText(R.id.m_label, str(d, "labels.mission", c.getString(R.string.widget_mission)));
        JSONObject m = d.optJSONObject("mission");
        if (m == null) {
            v.setViewVisibility(R.id.m_body, View.GONE);
            v.setViewVisibility(R.id.m_empty, View.VISIBLE);
            v.setTextViewText(R.id.m_empty, str(d, "labels.noMission", ""));
            v.setOnClickPendingIntent(R.id.w_root, open(c, "/app/missions", 301));
            return v;
        }
        v.setViewVisibility(R.id.m_body, View.VISIBLE);
        v.setViewVisibility(R.id.m_empty, View.GONE);
        v.setImageViewResource(R.id.m_cat_icon, icon(m.optString("category", "")));
        v.setTextViewText(R.id.m_cat, m.optString("categoryText", ""));
        v.setTextViewText(R.id.m_title, m.optString("title", ""));
        String dist = m.optString("distance", "");
        String meta = (dist.isEmpty() || "null".equals(dist) ? "" : dist + "  ·  ") + m.optString("when", "");
        v.setTextViewText(R.id.m_meta, meta);
        v.setTextViewText(R.id.m_join, str(d, "labels.join", "Join"));
        String link = m.optString("link", "/app/missions");
        v.setOnClickPendingIntent(R.id.w_root, open(c, link, 302));
        v.setOnClickPendingIntent(R.id.m_join, open(c, link, 303));
        v.setViewVisibility(R.id.m_join, widthDp(options, 250) >= 200 ? View.VISIBLE : View.GONE);
        return v;
    }
}
