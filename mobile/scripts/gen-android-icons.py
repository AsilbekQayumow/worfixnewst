"""Turns the site's line icons (web/src/components/icons.tsx) into Android vector drawables for widgets,
the walk panel and app shortcuts. Run from mobile/: python3 scripts/gen-android-icons.py"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT.parent / "web/src/components/icons.tsx").read_text()
RES = ROOT / "android/app/src/main/res/drawable"

def shapes(name):
    m = re.search(rf"^  {name}: <>(.*?)</>,$", SRC, re.M)
    if not m: raise SystemExit(f"no icon {name}")
    out = []
    for tag in re.findall(r"<(path|circle|rect)([^>]*)/>", m.group(1)):
        kind, attrs = tag
        a = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
        if kind == "path": out.append(a["d"])
        elif kind == "circle":
            cx, cy, r = float(a["cx"]), float(a["cy"]), float(a["r"])
            out.append(f"M{cx - r},{cy} a{r},{r} 0 1,0 {2 * r},0 a{r},{r} 0 1,0 {-2 * r},0")
        else:
            x, y, w, h, rx = (float(a.get(k, 0)) for k in ("x", "y", "width", "height", "rx"))
            out.append(f"M{x + rx},{y} h{w - 2 * rx} a{rx},{rx} 0 0 1 {rx},{rx} v{h - 2 * rx} a{rx},{rx} 0 0 1 {-rx},{rx} h{-(w - 2 * rx)} a{rx},{rx} 0 0 1 {-rx},{-rx} v{-(h - 2 * rx)} a{rx},{rx} 0 0 1 {rx},{-rx} Z")
    return out

def paths(name, color, width=1.8, indent="    "):
    return "\n".join(f'{indent}<path android:pathData="{d}" android:strokeColor="{color}" android:strokeWidth="{width}" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000" />' for d in shapes(name))

def icon(file, name, color, size=24, width=1.8):
    (RES / f"{file}.xml").write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="{size}dp" android:height="{size}dp" android:viewportWidth="24" android:viewportHeight="24">
{paths(name, color, width)}
</vector>
''')

def badge(file, name, bg):
    """A round coloured badge with a white glyph (app shortcuts)."""
    (RES / f"{file}.xml").write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="48dp" android:height="48dp" android:viewportWidth="48" android:viewportHeight="48">
    <path android:pathData="M24,0 a24,24 0 1,0 0.01,0 Z" android:fillColor="{bg}" />
    <group android:translateX="12" android:translateY="12">
{paths(name, "#FFFFFF", 2.0, "        ")}
    </group>
</vector>
''')

# widgets: icons tinted with the theme ink, plus coloured accents
for n in ["flame", "pin", "users", "clock", "check", "map", "footprints", "leaf", "droplet", "paw", "book", "recycle", "hands", "trophy", "zap", "layers"]:
    icon(f"ic_w_{n}", n, "@color/w_ink")
icon("ic_w_flame_color", "flame", "@color/worfix_flame", width=2.0)
icon("ic_w_pin_color", "pin", "@color/worfix_berry", width=2.0)
icon("ic_w_map_color", "map", "@color/worfix_sky", width=2.0)
icon("ic_w_users_color", "users", "@color/worfix_green", width=2.0)
icon("ic_w_leaf_color", "leaf", "@color/worfix_green", width=2.0)
icon("ic_w_clock_color", "clock", "@color/worfix_sun", width=2.0)
icon("ic_w_check_white", "check", "#FFFFFF", width=2.2)
icon("ic_w_footprints_white", "footprints", "#FFFFFF", width=2.0)
# the walk panel
icon("ic_walk_footprints", "footprints", "#FFFFFF", width=2.0)
# app shortcuts
badge("sc_map", "map", "#1C9BF0")
badge("sc_missions", "search", "#1FA84A")
badge("sc_walk", "footprints", "#FF8A1F")
print("icons written to", RES)
