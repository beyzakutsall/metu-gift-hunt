// Yüzen bina etiketleri: uzaktan bakınca tabelalar okunmadığı için önemli binaların adı
// binanın üstünde, kameraya dönük küçük bir isim etiketiyle (yarı saydam koyu kutu, beyaz
// piksel yazı) görünür. Kamera yaklaştıkça etiket solar ve kaybolur; o mesafede tabela okunur.
// Ekranda üst üste binen etiketlerden önceliği düşük olan gizlenir.
import * as THREE from 'three';
import { pikselYaziCiz, pikselDokusu } from './piksel-yazi.js';

const BUYUK_BINA_ALANI = 700; // blok²; önemli işaretli olmasa da bundan büyük binalar etiketlenir
const PUNTO = 12;
const YUKSEKLIK_PX = 18;      // etiket tuvalinin yüksekliği
const EKRAN_OLCEGI = 1.5;     // tuval pikseli başına ekran pikseli
const SOLMA_YAKIN = 45;       // blok; bundan yakında etiket görünmez
const SOLMA_UZAK = 90;        // bundan uzakta tam görünür

function etiketTuvali(ad) {
  const olcum = document.createElement('canvas').getContext('2d');
  olcum.font = `bold ${PUNTO}px "Trebuchet MS", Verdana, sans-serif`;
  const tuval = document.createElement('canvas');
  tuval.width = Math.ceil(olcum.measureText(ad).width) + 10;
  tuval.height = YUKSEKLIK_PX;
  const ctx = tuval.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, tuval.width, tuval.height);
  pikselYaziCiz(ctx, ad, { x: 0, y: 0, w: tuval.width, h: tuval.height }, { enBuyukPunto: PUNTO, enKucukPunto: PUNTO, enFazlaSatir: 1 });
  return tuval;
}

export function etiketleriOlustur(binalar) {
  // Önemli ya da büyük binalar; aynı adlı binalardan yalnızca en büyüğü
  const secilen = new Map();
  for (const b of binalar) {
    if (!b.onemli && b.alan < BUYUK_BINA_ALANI) continue;
    const onceki = secilen.get(b.ad);
    if (!onceki || b.alan > onceki.alan) secilen.set(b.ad, b);
  }
  const grup = new THREE.Group();
  const etiketler = [...secilen.values()]
    .sort((p, q) => (q.onemli - p.onemli) || (q.alan - p.alan))
    .map(b => {
      const tuval = etiketTuvali(b.ad);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: pikselDokusu(tuval), transparent: true, depthTest: false, sizeAttenuation: false
      }));
      sprite.position.set(b.merkez.x, b.yukseklik + 2, b.merkez.z);
      sprite.renderOrder = 10; // binaların üstünde çizilsin
      grup.add(sprite);
      return { sprite, genislik: tuval.width * EKRAN_OLCEGI, yukseklik: tuval.height * EKRAN_OLCEGI };
    });

  const ekran = new THREE.Vector3();
  const gorunenler = [];
  // Her karede: sabit ekran boyu, kameraya yakınlığa göre solma ve üst üste binenleri gizleme
  grup.userData.guncelle = (kamera, ekranGenisligi, ekranYuksekligi) => {
    const birimBasinaPx = ekranYuksekligi / (2 * Math.tan(THREE.MathUtils.degToRad(kamera.fov) / 2));
    gorunenler.length = 0;
    for (const e of etiketler) {
      const s = e.sprite;
      const opaklik = THREE.MathUtils.smoothstep(kamera.position.distanceTo(s.position), SOLMA_YAKIN, SOLMA_UZAK);
      ekran.copy(s.position).project(kamera);
      if (opaklik <= 0.01 || ekran.z > 1) { s.visible = false; continue; }
      const x = (ekran.x + 1) / 2 * ekranGenisligi, y = (1 - ekran.y) / 2 * ekranYuksekligi;
      const kutu = { x0: x - e.genislik / 2, x1: x + e.genislik / 2, y0: y - e.yukseklik / 2, y1: y + e.yukseklik / 2 };
      // Liste önceliğe göre sıralı: önce gelen kazanır
      s.visible = !gorunenler.some(g => kutu.x0 < g.x1 && kutu.x1 > g.x0 && kutu.y0 < g.y1 && kutu.y1 > g.y0);
      if (!s.visible) continue;
      gorunenler.push(kutu);
      s.material.opacity = opaklik;
      s.scale.set(e.genislik / birimBasinaPx, e.yukseklik / birimBasinaPx, 1);
    }
  };
  grup.userData.etiketSayisi = etiketler.length;
  return grup;
}
