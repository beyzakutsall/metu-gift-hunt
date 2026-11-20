// Piksel yazı: metin küçük puntoyla canvas'a yazılır, kenar yumuşatması eşiklenerek keskin
// piksellere çevrilir. Doku NearestFilter ile büyütüldüğünde Minecraft yazısı gibi görünür.
// Türkçe karakterler tarayıcının yazı tipinden geldiği için ayrıca tanımlanmaz.
import * as THREE from 'three';

const YAZI_TIPI = 'bold {p}px "Trebuchet MS", Verdana, sans-serif';
const ESIK = 120; // bu opaklığın üstündeki pikseller tam boyanır, altındakiler boş kalır

// Metni kelimelerden genişliğe sığan satırlara böler; sığmayan tek kelime kendi satırında kalır
function satirlaraBol(ctx, metin, genislik) {
  const satirlar = [];
  let satir = '';
  for (const kelime of metin.split(/\s+/)) {
    const aday = satir ? `${satir} ${kelime}` : kelime;
    if (satir && ctx.measureText(aday).width > genislik) {
      satirlar.push(satir);
      satir = kelime;
    } else satir = aday;
  }
  if (satir) satirlar.push(satir);
  return satirlar;
}

// Metni hedef bağlamın (ctx) kutu = { x, y, w, h } alanına ortalayarak piksel yazıyla çizer.
// Punto, metin en fazla enFazlaSatir satıra sığana kadar küçültülür.
export function pikselYaziCiz(ctx, metin, kutu, { renk = '#ffffff', enBuyukPunto = 12, enKucukPunto = 7, enFazlaSatir = 2 } = {}) {
  const gecici = document.createElement('canvas');
  gecici.width = kutu.w;
  gecici.height = kutu.h;
  const g = gecici.getContext('2d', { willReadFrequently: true });

  let punto = enBuyukPunto, satirlar;
  for (; punto >= enKucukPunto; punto--) {
    g.font = YAZI_TIPI.replace('{p}', punto);
    satirlar = satirlaraBol(g, metin, kutu.w - 2);
    const enGenis = Math.max(...satirlar.map(s => g.measureText(s).width));
    if (satirlar.length <= enFazlaSatir && enGenis <= kutu.w - 2 && satirlar.length * (punto + 1) <= kutu.h) break;
  }
  punto = Math.max(punto, enKucukPunto);
  g.font = YAZI_TIPI.replace('{p}', punto);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = renk;
  const satirYuksekligi = punto + 1;
  const ust = kutu.h / 2 - (satirlar.length - 1) * satirYuksekligi / 2;
  satirlar.forEach((s, k) => g.fillText(s, Math.round(kutu.w / 2), Math.round(ust + k * satirYuksekligi)));

  // Eşikleme: yarı saydam kenar pikselleri ya tam renk ya boş olur
  const veri = g.getImageData(0, 0, kutu.w, kutu.h);
  const p = veri.data;
  for (let k = 3; k < p.length; k += 4) p[k] = p[k] >= ESIK ? 255 : 0;
  g.putImageData(veri, 0, 0);
  ctx.drawImage(gecici, kutu.x, kutu.y);
  return { punto, satirSayisi: satirlar.length };
}

// Piksel yazı tuvalinden keskin (büyütülünce bulanıklaşmayan) doku
export function pikselDokusu(tuval) {
  const doku = new THREE.CanvasTexture(tuval);
  doku.magFilter = THREE.NearestFilter;
  doku.minFilter = THREE.LinearMipmapLinearFilter; // uzaktan titremesin
  doku.colorSpace = THREE.NoColorSpace;            // shader renkleri dönüştürmeden basar
  return doku;
}
