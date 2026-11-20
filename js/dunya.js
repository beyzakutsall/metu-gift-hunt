// OSM verisini blok ızgarasına çevirir: her hücre için bir zemin türü tutulur.
// Önce alanlar (büyükten küçüğe) boyanır, sonra çizgiler (dere, patika, yol) üstlerine çizilir.
import { IZGARA, enlemBoylamdanBloga } from './projeksiyon.js';

// Değerler aynı zamanda dokular.js'deki doku katmanlarının sırasıdır
export const ZEMIN = {
  CIM: 0,
  ORMAN: 1,
  TOPRAK: 2,
  ASFALT: 3,
  TAS: 4,
  OTOPARK: 5,
  SU: 6,
  SAHA: 7,
  PIST: 8
};
export const ZEMIN_SAYISI = 9;

const TOPRAK_YUZEYLER = new Set([
  'ground', 'dirt', 'earth', 'mud', 'unpaved', 'compacted', 'gravel', 'fine_gravel', 'sand', 'grass'
]);
const SERT_YUZEYLER = new Set(['asphalt', 'concrete', 'paved', 'paving_stones', 'sett', 'concrete:plates']);

// Kapalı bir alanın zemin türü; ilgilenmediğimiz alanlar için null
function alanZemini(t) {
  if (t.highway) return t.area === 'yes' ? ZEMIN.TAS : null;
  if (t.amenity === 'parking') return ZEMIN.OTOPARK;
  if (t.natural === 'water' || t.leisure === 'swimming_pool') return ZEMIN.SU;
  if (t.leisure === 'track') return t.area === 'yes' ? ZEMIN.PIST : null;
  if (t.leisure === 'pitch') return SERT_YUZEYLER.has(t.surface) ? ZEMIN.OTOPARK : ZEMIN.SAHA;
  if (t.landuse === 'forest' || t.landuse === 'orchard' || t.natural === 'wood' || t.natural === 'scrub') {
    return ZEMIN.ORMAN;
  }
  if (t.landuse === 'farmland' || t.landuse === 'brownfield' || t.landuse === 'construction') return ZEMIN.TOPRAK;
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'recreation_ground' ||
      t.leisure === 'park' || t.leisure === 'garden') {
    return ZEMIN.CIM;
  }
  return null;
}

// Çizgi olarak çizilen öğeler: genişlik blok cinsinden, sira küçükten büyüğe çizilir (büyük üstte kalır)
function cizgiBilgisi(t) {
  if (t.waterway) return { genislik: 1, zemin: ZEMIN.SU, sira: 0 };
  if (t.leisure === 'track' && t.area !== 'yes') return { genislik: 3, zemin: ZEMIN.PIST, sira: 1 };
  if (!t.highway || t.area === 'yes') return null;

  const toprakMi = TOPRAK_YUZEYLER.has(t.surface);
  switch (t.highway) {
    case 'track':
      return { genislik: 1, zemin: ZEMIN.TOPRAK, sira: 1 };
    case 'footway': case 'path': case 'pedestrian': case 'steps': case 'cycleway': case 'bridleway':
      return { genislik: 1, zemin: toprakMi ? ZEMIN.TOPRAK : ZEMIN.TAS, sira: 2 };
    case 'service': case 'residential': case 'unclassified': case 'living_street':
    case 'primary_link': case 'secondary_link': case 'tertiary_link': case 'trunk_link':
      return { genislik: 2, zemin: toprakMi ? ZEMIN.TOPRAK : ZEMIN.ASFALT, sira: 3 };
    case 'secondary': case 'tertiary':
      return { genislik: 3, zemin: ZEMIN.ASFALT, sira: 4 };
    case 'primary': case 'trunk':
      return { genislik: 4, zemin: ZEMIN.ASFALT, sira: 5 };
    default:
      return null; // construction, proposed vb.
  }
}

export function noktalaraCevir(geometri) {
  return geometri.map(n => enlemBoylamdanBloga(n.lat, n.lon));
}

export function kapaliMi(geometri) {
  const ilk = geometri[0];
  const son = geometri[geometri.length - 1];
  return geometri.length >= 4 && ilk.lat === son.lat && ilk.lon === son.lon;
}

// Halkaların toplam alanı (shoelace); iç içe alanlarda küçüğün üstte kalması için sıralamada kullanılır
export function alanHesapla(halkalar) {
  let toplam = 0;
  for (const halka of halkalar) {
    let a = 0;
    for (let k = 0; k < halka.length - 1; k++) {
      a += halka[k].x * halka[k + 1].z - halka[k + 1].x * halka[k].z;
    }
    toplam += Math.abs(a) / 2;
  }
  return toplam;
}

// Tek-çift kuralıyla tarama: her satırda hücre merkezlerinden geçen yatay çizginin
// kenarları kestiği yerler arasındaki hücreler bulunur. Delikli çokgenler de doğru çıkar.
// Her dolu aralık için ziyaret(j, i0, i1) çağrılır (j satır, i0..i1 dahil sütunlar).
// Zemin ve binalar aynı taramayı kullanır.
export function poligonTara(halkalar, genislik, derinlik, ziyaret) {
  let zMin = Infinity, zMax = -Infinity;
  for (const halka of halkalar) {
    for (const n of halka) {
      if (n.z < zMin) zMin = n.z;
      if (n.z > zMax) zMax = n.z;
    }
  }
  const j0 = Math.max(0, Math.ceil(zMin - 0.5));
  const j1 = Math.min(derinlik - 1, Math.floor(zMax - 0.5));
  const kesisimler = [];

  for (let j = j0; j <= j1; j++) {
    const zc = j + 0.5;
    kesisimler.length = 0;
    for (const halka of halkalar) {
      for (let k = 0; k < halka.length - 1; k++) {
        const a = halka[k], b = halka[k + 1];
        if ((a.z <= zc) !== (b.z <= zc)) {
          kesisimler.push(a.x + (zc - a.z) * (b.x - a.x) / (b.z - a.z));
        }
      }
    }
    kesisimler.sort((p, q) => p - q);
    for (let k = 0; k + 1 < kesisimler.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(kesisimler[k] - 0.5));
      const i1 = Math.min(genislik - 1, Math.floor(kesisimler[k + 1] - 0.5));
      if (i0 <= i1) ziyaret(j, i0, i1);
    }
  }
}

export function zeminIzgarasiOlustur(osm) {
  const { genislik, derinlik } = IZGARA;
  const zemin = new Uint8Array(genislik * derinlik).fill(ZEMIN.CIM);

  function poligonDoldur(halkalar, deger) {
    poligonTara(halkalar, genislik, derinlik, (j, i0, i1) => {
      zemin.fill(deger, j * genislik + i0, j * genislik + i1 + 1);
    });
  }

  // Merkezi çizgiye (genislik / 2 + pay) uzaklıktaki hücreleri boyar
  function cizgiCiz(noktalar, cizgiGenisligi, deger) {
    const r = cizgiGenisligi / 2 + 0.25;
    const r2 = r * r;
    for (let k = 0; k < noktalar.length - 1; k++) {
      const a = noktalar[k], b = noktalar[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const uzunluk2 = dx * dx + dz * dz;
      const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r));
      const i1 = Math.min(genislik - 1, Math.ceil(Math.max(a.x, b.x) + r));
      const j0 = Math.max(0, Math.floor(Math.min(a.z, b.z) - r));
      const j1 = Math.min(derinlik - 1, Math.ceil(Math.max(a.z, b.z) + r));

      for (let j = j0; j <= j1; j++) {
        const pz = j + 0.5;
        for (let i = i0; i <= i1; i++) {
          const px = i + 0.5;
          let t = uzunluk2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / uzunluk2 : 0;
          t = Math.max(0, Math.min(1, t));
          const qx = a.x + t * dx - px;
          const qz = a.z + t * dz - pz;
          if (qx * qx + qz * qz <= r2) zemin[j * genislik + i] = deger;
        }
      }
    }
  }

  const alanlar = [];
  const cizgiler = [];

  for (const oge of osm.elements) {
    const t = oge.tags || {};
    if (t.building) continue; // binalar sonraki adımda

    if (oge.type === 'way' && oge.geometry) {
      const alanTuru = kapaliMi(oge.geometry) ? alanZemini(t) : null;
      if (alanTuru !== null) {
        const halkalar = [noktalaraCevir(oge.geometry)];
        alanlar.push({ halkalar, deger: alanTuru, alan: alanHesapla(halkalar) });
        continue;
      }
      const cizgi = cizgiBilgisi(t);
      if (cizgi) cizgiler.push({ noktalar: noktalaraCevir(oge.geometry), ...cizgi });
    } else if (oge.type === 'relation' && oge.members) {
      // Çok parçalı alan: tüm üye çizgileri tek-çift kuralıyla birlikte doldurulur
      const alanTuru = alanZemini(t);
      if (alanTuru === null) continue;
      const halkalar = oge.members
        .filter(u => u.type === 'way' && u.geometry)
        .map(u => noktalaraCevir(u.geometry));
      if (halkalar.length) alanlar.push({ halkalar, deger: alanTuru, alan: alanHesapla(halkalar) });
    }
  }

  alanlar.sort((p, q) => q.alan - p.alan);
  for (const a of alanlar) poligonDoldur(a.halkalar, a.deger);

  cizgiler.sort((p, q) => p.sira - q.sira);
  for (const c of cizgiler) cizgiCiz(c.noktalar, c.genislik, c.zemin);

  return { genislik, derinlik, zemin };
}
