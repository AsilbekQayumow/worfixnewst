package site.worfix.app.widgets;

import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

import site.worfix.app.R;

/** The community this week: verified missions, volunteers and hours of help. */
public class PulseWidget extends WorfixWidget {
    private static String num(int n) { return String.format(Locale.US, "%,d", n).replace(',', ' '); }

    @Override
    protected RemoteViews render(Context c, JSONObject d, Bundle options) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_pulse);
        JSONObject p = d.optJSONObject("pulse");
        v.setTextViewText(R.id.p_title, str(d, "labels.pulse", c.getString(R.string.widget_pulse)));
        v.setTextViewText(R.id.p_missions, num(p == null ? 0 : p.optInt("missions", 0)));
        v.setTextViewText(R.id.p_people, num(p == null ? 0 : p.optInt("people", 0)));
        v.setTextViewText(R.id.p_hours, num(p == null ? 0 : p.optInt("hours", 0)));
        v.setTextViewText(R.id.p_missions_label, str(d, "pulse.missionsText", ""));
        v.setTextViewText(R.id.p_people_label, str(d, "pulse.peopleText", ""));
        v.setTextViewText(R.id.p_hours_label, str(d, "pulse.hoursText", ""));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/app", 501));
        return v;
    }
}
