// Bina adları: tabelalar ve yüzen etiketler için adlandırılmış binaların listesi.
// Ad önce data/bina-adlari.json'dan, sonra OSM'deki short_name'den, sonra name'den alınır;
// uzun OSM adları kısaltılır ("Mühendisliği Bölümü" → "Müh." gibi).
import { IZGARA } from './projeksiyon.js';
import { noktalaraCevir, poligonTara, alanHesapla } from './dunya.js';

// Tabelaya sığmayacak kadar uzun adlar için sırayla uygulanan kısaltmalar
const KISALTMALAR = [
  [/^ODTÜ\s+/i, ''],
  [/\s+Mühendisliği\s+Bölümü/g, ' Müh.'],
  [/\s+Mühendisliği/g, ' Müh.'],
  [/\s+Bölümü/g, ''],
  [/\s+Fakültesi/g, ' Fak.'],
  [/\s+Laboratuvarı/g, ' Lab.'],
  [/\s+Araştırma\s+/g, ' Arş. '],
  [/\s+Binası/g, ''],
  [/\s+Blok\b/g, '']
];

export function adiKisalt(ad) {
  let k = ad.trim();
  for (const [desen, yerine] of KISALTMALAR) k = k.replace(desen, yerine);
  return k.trim() || ad.trim();
}

export async function binaAdlariniYukle() {
  try {
    const yanit = await fetch('data/bina-adlari.json');
    if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
    return (await yanit.json()).binalar || {};
  } catch (hata) {
    // Dosya okunamazsa OSM adlarıyla devam edilir
    console.warn('data/bina-adlari.json okunamadı:', hata);
    return {};
  }
}

// Adlandırılmış binaları döndürür: { anahtar, ad, onemli, halkalar, alan, hucreler, yukseklik, merkez }
// hucreler: binanın kapladığı ızgara hücreleri (h = j * genislik + i)
export function adliBinalariBul(osm, kisaAdlar, binaIzgarasi) {
  const { genislik, derinlik } = IZGARA;
  const binalar = [];
  for (const oge of osm.elements) {
    const t = oge.tags || {};
    if (!t.building || t.building === 'roof' || t.building === 'construction') continue;
    const anahtar = `${oge.type}/${oge.id}`;
    const elle = kisaAdlar[anahtar];
    const ad = elle?.ad || t.short_name || (t.name && adiKisalt(t.name));
    if (!ad) continue;

    let halkalar;
    if (oge.type === 'way' && oge.geometry) halkalar = [noktalaraCevir(oge.geometry)];
    else if (oge.type === 'relation' && oge.members) {
      halkalar = oge.members.filter(u => u.type === 'way' && u.geometry).map(u => noktalaraCevir(u.geometry));
    }
    if (!halkalar || !halkalar.length) continue;

    const hucreler = [];
    let yukseklik = 0, sx = 0, sz = 0;
    poligonTara(halkalar, genislik, derinlik, (j, i0, i1) => {
      for (let i = i0; i <= i1; i++) {
        const h = j * genislik + i;
        hucreler.push(h);
        yukseklik = Math.max(yukseklik, binaIzgarasi.yukseklik[h]);
        sx += i + 0.5; sz += j + 0.5;
      }
    });
    if (!hucreler.length) continue;

    binalar.push({
      anahtar, ad, onemli: !!elle?.onemli, halkalar, hucreler, yukseklik,
      alan: alanHesapla(halkalar),
      merkez: { x: sx / hucreler.length, z: sz / hucreler.length }
    });
  }
  return binalar;
}
