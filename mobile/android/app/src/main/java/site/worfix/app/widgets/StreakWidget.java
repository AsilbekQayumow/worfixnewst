package site.worfix.app.widgets;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import site.worfix.app.R;

/** Streak and level: the flame, the days in a row, today's state and the XP bar. */
public class StreakWidget extends WorfixWidget {
    @Override
    protected RemoteViews render(Context c, JSONObject d, Bundle options) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_streak);
        JSONObject streak = d.optJSONObject("streak"), level = d.optJSONObject("level");
        int days = streak == null ? 0 : streak.optInt("days", 0);
        v.setTextViewText(R.id.streak_label, str(d, "labels.streak", ""));
        v.setTextViewText(R.id.streak_num, String.valueOf(days));
        v.setTextViewText(R.id.streak_text, str(d, "streak.text", ""));
        v.setTextViewText(R.id.streak_hint, str(d, "streak.hint", ""));
        boolean safe = streak != null && streak.optBoolean("safe", false);
        v.setTextColor(R.id.streak_hint, c.getColor(safe ? R.color.worfix_green : R.color.worfix_flame));
        v.setTextViewText(R.id.level_title, str(d, "level.title", ""));
        v.setTextViewText(R.id.level_xp, str(d, "level.text", ""));
        v.setProgressBar(R.id.level_bar, 1000, level == null ? 0 : (int) Math.round(level.optDouble("progress", 0) * 1000), false);
        boolean tall = heightDp(options, 110) >= 140;
        v.setViewVisibility(R.id.level_row, tall ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.level_bar, tall ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/app", 201));
        return v;
    }
}
