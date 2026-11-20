# supabase/semalar/004_yasak_bolgeler.sql dosyasini data/campus.json dosyasindan uretir.
# Kullanim (repo kokunden): python supabase/yasak-bolgeler-uret.py data/campus.json > supabase/semalar/004_yasak_bolgeler.sql
import json, sys, math
sys.stdout.reconfigure(encoding="utf-8")
d = json.load(open(sys.argv[1], encoding='utf8'))
PAY_M = 5
dlat = PAY_M / 111320
rows = []
for e in d['elements']:
    t = e.get('tags') or {}
    tur = None
    if t.get('landuse') == 'residential': tur = 'konut alanı'
    elif t.get('building') == 'dormitory': tur = 'yurt'
    elif t.get('building') in ('house', 'apartments', 'residential', 'detached'): tur = 'konut'
    if not tur: continue
    pts = []
    if e['type'] == 'way' and e.get('geometry'): pts = e['geometry']
    elif e['type'] == 'relation':
        for u in e.get('members', []):
            if u.get('geometry'): pts += u['geometry']
    if not pts: continue
    g = min(p['lat'] for p in pts); k = max(p['lat'] for p in pts)
    b = min(p['lon'] for p in pts); o = max(p['lon'] for p in pts)
    dlon = PAY_M / (111320 * math.cos(math.radians((g + k) / 2)))
    ad = (tur + ': ' + t['name']) if t.get('name') else tur
    ad = ad + f" (osm {e['type']}/{e['id']})"
    rows.append((ad.replace("'", "''"), g - dlat, b - dlon, k + dlat, o + dlon))
# kontrol: başlangıç noktası (Kütüphane civarı) yasak olmamalı
for r in rows:
    if r[1] <= 39.8915 <= r[3] and r[2] <= 32.7835 <= r[4]: print('UYARI baslangic yasak:', r[0], file=sys.stderr)
out = ["-- ODTÜ Hediye Avı: saklama yasak bölgeleri (kaba dikdörtgenler). 003'ten sonra yapıştırılır.",
       "-- data/campus.json'dan üretildi: landuse=residential alanlar ve building=house|apartments|",
       "-- residential|detached|dormitory binaları, her biri 5 m paylı sınır kutusu olarak.",
       "-- Yeniden yapıştırmak güvenlidir: önce tablo boşaltılır. Elle bölge eklemek için README'ye bakın.",
       "", "delete from public.yasak_bolgeler;", "",
       "insert into public.yasak_bolgeler (ad, guney, bati, kuzey, dogu) values"]
out.append(",\n".join(f"  ('{a}', {g:.6f}, {b:.6f}, {k:.6f}, {o:.6f})" for a, g, b, k, o in rows) + ";")
print("\n".join(out))
print(len(rows), file=sys.stderr)
