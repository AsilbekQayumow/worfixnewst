"""Builds the place picker data (src/lib/geo/uz-places.json and public/places/<districtId>.json).

Sources (open data on GitHub):
  git clone --depth 1 https://github.com/kenjebaev/regions  <src>/kenjebaev_regions                       (mahallas, 2025)
  git clone --depth 1 https://github.com/MIMAXUZ/uzbekistan-regions-data <src>/MIMAXUZ_uzbekistan-regions-data (districts, SOATO ids, ru/cyrillic)
Run: python3 scripts/build-places.py <web dir> <src dir>
"""
import json, re, difflib, os, sys, collections
OUT = sys.argv[1]
SRC = sys.argv[2] if len(sys.argv) > 2 else '.places-src'
K = json.load(open(f'{SRC}/kenjebaev_regions/regions.json'))
L = lambda f: json.load(open(f'{SRC}/MIMAXUZ_uzbekistan-regions-data/JSON/{f}.json', encoding='utf-8-sig'))
MR, MD = L('regions'), L('districts')
APOS = str.maketrans({"`": "‘", "'": "‘", "’": "‘", "ʻ": "‘", "ʼ": "‘", "‛": "‘"})
def fix(s):
    s = re.sub(r"\s+", " ", s.strip()).translate(APOS).replace("?", "e")
    s = re.sub(r"\s*\((jamoatchi|jamoat)[^)]*\)?", "", s).strip()
    return s
def key(s):
    s = fix(s).lower().replace("‘", "").replace("ʼ", "")
    s = re.sub(r"\b(tumani|shahri|viloyati|respublikasi|sh\.|t\.)\b", "", s)
    s = s.replace("surxandaryo", "surxondaryo").replace("bektimer", "bektemir").replace("sergeli", "sirgali").replace("m.ulugbek", "mirzo ulugbek")
    return re.sub(r"[^a-z0-9]", "", s)
# region → geo.json province name
PROV = {"andijon": "Andijan Region", "buxoro": "Bukhara Region", "fargona": "Fergana Region", "jizzax": "Jizzakh Region",
        "qoraqalpogiston": "Karakalpakstan", "namangan": "Namangan Region", "navoiy": "Navoiy Region", "qashqadaryo": "Qashqadaryo Region",
        "samarqand": "Samarqand Region", "sirdaryo": "Sirdaryo Region", "surxondaryo": "Surxondaryo Region", "toshkentshahri": "Tashkent",
        "toshkent": "Tashkent Region", "xorazm": "Xorazm Region"}
def prov(name):
    k = key(name)
    if "toshkent" in k and "shah" in name.lower(): return "Tashkent"
    for p, v in PROV.items():
        if k.startswith(p): return v
    raise SystemExit("no province for " + name)
regions, rid_of = [], {}
for r in MR:
    p = prov(r['name_uz'])
    regions.append({"id": r['soato_id'], "p": p, "uz": fix(r['name_uz']), "oz": r['name_oz'], "ru": r['name_ru']})
    rid_of[r['id']] = r['soato_id']
kr = {r['id']: prov(r['name']) for r in K['regions']}
p2rid = {x['p']: x['id'] for x in regions}
def dname(n):
    n = fix(n).replace(" shaxar", " shahri")
    return n if re.search(r"(tumani|shahri)$", n) else n + " shahri"
districts = [{"id": d['soato_id'], "r": rid_of[d['region_id']], "uz": dname(d['name_uz']), "oz": d['name_oz'], "ru": d['name_ru']} for d in MD if "tumanlari" not in d['name_uz']]
by_region = collections.defaultdict(list)
for d in districts: by_region[d['r']].append(d)
# match kenjebaev districts → MIMAXUZ districts
kd2 = {}
unmatched = []
for d in K['districts']:
    rid = p2rid[kr[d['region_id']]]
    city = d['name'].lower().strip().endswith("shahri")
    pool = [x for x in by_region[rid] if x['uz'].endswith("shahri") == city]
    cands = {key(x['uz']): x for x in pool}
    k = key(d['name'])
    pick = [cands[k]] if k in cands else []
    if not pick:
        m = difflib.get_close_matches(k, list(cands), n=1, cutoff=0.8)
        pick = [cands[m[0]]] if m else []
    if not pick:
        other = {key(x['uz']): x for x in by_region[rid] if x not in pool and x['id'] not in kd2.values()}
        pick = [other[k]] if k in other else []
    if pick: kd2[d['id']] = pick[0]['id']
    else:
        # a district the SOATO list lacks (a newer city): keep it with its own id
        nd = {"id": 9000000 + d['id'], "r": rid, "uz": fix(d['name']), "oz": "", "ru": ""}
        districts.append(nd); by_region[rid].append(nd); kd2[d['id']] = nd['id']
        unmatched.append((d['name'], kr[d['region_id']]))
mah = collections.defaultdict(list)
for q in K['quarters']:
    did = kd2.get(q['district_id'])
    if not did: continue
    mah[did].append((q['id'], fix(q['name'])))
os.makedirs(f'{OUT}/public/places', exist_ok=True)
total = 0
for d in districts:
    seen, names = set(), []
    for qid, n in sorted(mah.get(d['id'], []), key=lambda x: x[1].lower()):
        if n.lower() in seen: continue
        seen.add(n.lower()); names.append((qid, n))
    d['n'] = len(names)
    total += len(names)
    if names:
        json.dump([[f"m{qid}", n] for qid, n in names], open(f"{OUT}/public/places/{d['id']}.json", 'w'), ensure_ascii=False, separators=(',', ':'))
districts.sort(key=lambda d: (d['r'], d['uz'].lower()))
regions.sort(key=lambda r: r['uz'])
json.dump({"source": "kenjebaev/regions (2025-04, mahallalar), MIMAXUZ/uzbekistan-regions-data (tumanlar, SOATO)", "regions": regions, "districts": districts},
          open(f'{OUT}/src/lib/geo/uz-places.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print("regions", len(regions), "districts", len(districts), "mahallas", total)
print("unmatched", unmatched)
print("empty districts", [d['uz'] for d in districts if not d['n']])
