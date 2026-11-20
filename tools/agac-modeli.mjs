// 7x7x11 blokluk yılbaşı ağacını MagicaVoxel .vox formatında üretir: modeller/yilbasi-agaci.vox
// Kütüphane kullanmaz. Kullanım (repo kökünden): node tools/agac-modeli.mjs
// MagicaVoxel'de z ekseni yukarıdır; z = 0 en alt kattır.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rastgeleUretici } from '../js/rastgele.js';

const BOYUT = { x: 7, y: 7, z: 11 };
const MERKEZ = 3;

// Palet: voksellerdeki renk numarası n, RGBA listesindeki (n - 1). sıradaki renktir; 0 boş demektir
const RENK = {
  GOVDE: 1,      // kahverengi
  KOYU_YESIL: 2,
  ACIK_YESIL: 3,
  YILDIZ: 4,     // altın
  ISIK: 5        // en parlak sarı; sadece MagicaVoxel'de elle konacak ışıklar için ayrıldı
};
const PALET = {
  [RENK.GOVDE]: [110, 72, 40],
  [RENK.KOYU_YESIL]: [30, 100, 45],
  [RENK.ACIK_YESIL]: [60, 145, 60],
  [RENK.YILDIZ]: [212, 160, 23],
  [RENK.ISIK]: [255, 255, 0]
};

// Her yaprak katı: merkezden uzaklığa göre hangi hücrelerin dolu olduğu
const kare = (yaricap) => (dx, dy) => Math.abs(dx) <= yaricap && Math.abs(dy) <= yaricap;
const koseleriBosKare = (yaricap) => (dx, dy) =>
  kare(yaricap)(dx, dy) && !(Math.abs(dx) === yaricap && Math.abs(dy) === yaricap);
const arti = (dx, dy) => Math.abs(dx) + Math.abs(dy) <= 1;
const tek = (dx, dy) => dx === 0 && dy === 0;

const YAPRAK_KATLARI = {
  3: koseleriBosKare(3), // 7x7, köşeler boş
  4: kare(2),            // 5x5
  5: koseleriBosKare(2), // 5x5, köşeler boş
  6: kare(1),            // 3x3
  7: arti,               // artı
  8: tek
};

const rng = rastgeleUretici(2026); // sabit tohum: her çalıştırmada aynı ağaç
const vokseller = [];

for (let z = 0; z <= 2; z++) vokseller.push([MERKEZ, MERKEZ, z, RENK.GOVDE]);

for (const [zMetin, doluMu] of Object.entries(YAPRAK_KATLARI)) {
  const z = Number(zMetin);
  for (let y = 0; y < BOYUT.y; y++) {
    for (let x = 0; x < BOYUT.x; x++) {
      if (doluMu(x - MERKEZ, y - MERKEZ)) {
        vokseller.push([x, y, z, rng() < 0.5 ? RENK.KOYU_YESIL : RENK.ACIK_YESIL]);
      }
    }
  }
}

vokseller.push([MERKEZ, MERKEZ, 9, RENK.YILDIZ]);

// --- .vox yazımı ---
// Parça: 4 baytlık kimlik, içerik boyu, alt parçaların boyu, içerik, alt parçalar

function parca(kimlik, icerik, altParcalar = Buffer.alloc(0)) {
  const baslik = Buffer.alloc(12);
  baslik.write(kimlik, 0, 'ascii');
  baslik.writeInt32LE(icerik.length, 4);
  baslik.writeInt32LE(altParcalar.length, 8);
  return Buffer.concat([baslik, icerik, altParcalar]);
}

const boyutIcerik = Buffer.alloc(12);
boyutIcerik.writeInt32LE(BOYUT.x, 0);
boyutIcerik.writeInt32LE(BOYUT.y, 4);
boyutIcerik.writeInt32LE(BOYUT.z, 8);

const xyziIcerik = Buffer.alloc(4 + vokseller.length * 4);
xyziIcerik.writeInt32LE(vokseller.length, 0);
vokseller.forEach((v, k) => xyziIcerik.set(v, 4 + k * 4));

// Kullanılmayan palet yerleri gri tonlarla dolu; MagicaVoxel'de istenen renge çevrilebilir
const rgbaIcerik = Buffer.alloc(256 * 4);
for (let n = 1; n <= 256; n++) {
  const gri = Math.round(255 * (1 - (n - 1) / 255));
  const [r, g, b] = PALET[n] ?? [gri, gri, gri];
  rgbaIcerik.set([r, g, b, 255], (n - 1) * 4);
}

const ana = parca('MAIN', Buffer.alloc(0), Buffer.concat([
  parca('SIZE', boyutIcerik),
  parca('XYZI', xyziIcerik),
  parca('RGBA', rgbaIcerik)
]));

const dosyaBasligi = Buffer.alloc(8);
dosyaBasligi.write('VOX ', 0, 'ascii');
dosyaBasligi.writeInt32LE(150, 4);

const hedef = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeller', 'yilbasi-agaci.vox');
mkdirSync(dirname(hedef), { recursive: true });
writeFileSync(hedef, Buffer.concat([dosyaBasligi, ana]));

console.log(`Kaydedildi: ${hedef} (${vokseller.length} voksel)`);
console.log(`Işık rengi: palette ${RENK.ISIK}. renk (RGB ${PALET[RENK.ISIK].join(', ')})`);
