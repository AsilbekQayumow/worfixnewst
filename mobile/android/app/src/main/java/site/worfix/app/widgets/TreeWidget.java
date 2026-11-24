package site.worfix.app.widgets;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import site.worfix.app.R;

/** "My tree": grows with verified missions, droops when there are none for a while. */
public class TreeWidget extends WorfixWidget {
    private static final int[][] ART = {
        { R.drawable.tree_s0_t0, R.drawable.tree_s0_t1, R.drawable.tree_s0_t2 },
        { R.drawable.tree_s1_t0, R.drawable.tree_s1_t1, R.drawable.tree_s1_t2 },
        { R.drawable.tree_s2_t0, R.drawable.tree_s2_t1, R.drawable.tree_s2_t2 },
        { R.drawable.tree_s3_t0, R.drawable.tree_s3_t1, R.drawable.tree_s3_t2 },
        { R.drawable.tree_s4_t0, R.drawable.tree_s4_t1, R.drawable.tree_s4_t2 },
    };

    @Override
    protected RemoteViews render(Context c, JSONObject d, Bundle options) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_tree);
        JSONObject tree = d.optJSONObject("tree");
        int stage = tree == null ? 0 : Math.max(0, Math.min(4, tree.optInt("stage", 0)));
        int thirst = tree == null ? 0 : Math.max(0, Math.min(2, tree.optInt("thirst", 0)));
        v.setImageViewResource(R.id.tree_img, ART[stage][thirst]);
        v.setTextViewText(R.id.tree_label, str(d, "labels.tree", c.getString(R.string.widget_tree)));
        v.setTextViewText(R.id.tree_stage, str(d, "tree.title", ""));
        v.setTextViewText(R.id.tree_hint, str(d, "tree.hint", ""));
        v.setTextViewText(R.id.tree_count, String.valueOf(tree == null ? 0 : tree.optInt("count", 0)));
        // Small widget: the picture and the stage name only.
        v.setViewVisibility(R.id.tree_hint, heightDp(options, 160) >= 150 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/app/profile", 101));
        return v;
    }
}
