// Simge nesneler: bank, çöp kutusu, lamba, piknik masası, çeşme, bisiklet parkı, heykel ve
// bina girişleri. Yön bulmaya yarayan küçük ayrıntılar; hepsi koddan üretilen voksel modeller.
// Her tür tek geometridir ve 128x128 blokluk parçalarda InstancedMesh ile çizilir (ağaçlardaki yapı).
// Yerler OSM düğümlerinden ve data/elle-eklenen.json'dan gelir; OSM'de lamba olmadığı için
// lambalar yürüme yollarının kenarına kendiliğinden dizilir. Lambalar 17:00-07:00 arası yanar.
import * as THREE from 'three';
import { ZEMIN } from './dunya.js';
import { enlemBoylamdanBloga } from './projeksiyon.js';
import { DOLU } from './doluluk.js';
import { hacimdenGeometri } from './agaclar.js';
import { rastgeleUretici } from './rastgele.js';

const PARCA = 128;
const VOKSEL = 1 / 8;       // blok; nesneler bir bloktan küçük olduğu için ince voksel
const LAMBA_ARALIGI = 9;    // blok; kendiliğinden dizilen lambalar arası en az mesafe
const EN_FAZLA_LAMBA = 2500;

// ---------------- Modeller ----------------
// Her model: boyut, al(x, y, z) → renk kodu (0 boş) ve kodların rengi. y yukarı, model +z'ye bakar.

const RENK = {
  1: [120, 84, 48],   // ahşap
  2: [60, 60, 66],    // koyu metal
  3: [168, 164, 156], // taş
  4: [52, 118, 64],   // yeşil boya
  5: [255, 214, 120], // lamba camı (ışık)
  6: [70, 140, 200],  // su
  7: [150, 112, 60],  // bronz
  8: [40, 30, 26],    // kapı boşluğu
  9: [214, 206, 188]  // açık eşik taşı
};
const ISIK_KODU = 5;

const MODELLER = {
  // Bank: 1 blok uzunluk, oturma yeri ve arkalık; oturan +z'ye bakar
  bank: {
    boyut: [8, 5, 4],
    al: (x, y, z) => {
      if ((x === 0 || x === 7) && y < 2 && z < 3) return 2;   // ayaklar
      if (y === 2 && z < 3) return 1;                          // oturma tahtası
      if (z === 0 && y >= 3) return 1;                         // arkalık
      return 0;
    }
  },
  cop: {
    boyut: [3, 4, 3],
    al: (x, y, z) => (y === 3 ? (x === 1 && z === 1 ? 0 : 2) : 4)
  },
  // Lamba: 2 blok boyunda direk, tepede ışık
  lamba: {
    boyut: [3, 16, 3],
    al: (x, y, z) => {
      const orta = x === 1 && z === 1;
      if (y === 0) return 2;
      if (y < 13) return orta ? 2 : 0;
      if (y < 15) return ISIK_KODU;
      return 2; // şapka
    }
  },
  piknik: {
    boyut: [8, 4, 8],
    al: (x, y, z) => {
      if (y === 3 && z >= 2 && z <= 5) return 1;                       // masa üstü
      if (y === 1 && (z <= 1 || z >= 6)) return 1;                     // iki yandaki oturaklar
      if ((x === 1 || x === 6) && y < 3 && (z === 3 || z === 4)) return 1; // ayaklar
      if ((x === 1 || x === 6) && y === 0 && (z === 0 || z === 7)) return 1;
      return 0;
    }
  },
  cesme: {
    boyut: [3, 7, 3],
    al: (x, y, z) => (y === 6 ? (x === 1 && z === 1 ? 6 : 3) : (y < 6 ? 3 : 0))
  },
  bisiklet: {
    boyut: [8, 3, 2],
    al: (x, y, z) => (z === 0 && (y === 2 || x % 3 === 0) ? 2 : 0) // yan yana U biçimli demirler
  },
  // Heykel: taş kaide ve bronz figür
  heykel: {
    boyut: [6, 14, 6],
    al: (x, y, z) => {
      if (y < 5) return 3;
      const dx = Math.abs(x - 2.5), dz = Math.abs(z - 2.5);
      if (y < 11) return dx < 1 && dz < 1 ? 7 : 0;                     // gövde
      if (y < 13) return dx < 1 && dz < 1 ? 7 : 0;                     // baş
      return 0;
    }
  },
  // Giriş: duvara yapışık koyu kapı ve önünde açık renkli eşik. Model z=0'da duvara dayanır,
  // bu yüzden z ekseninde ortalanmaz; kapı 1 kat (1 blok) boyunda
  giris: {
    boyut: [8, 9, 4],
    duvaraDayali: true,
    al: (x, y, z) => {
      if (z === 0 && x >= 1 && x <= 6 && y >= 1) return 8;
      if (y === 0) return 9;
      return 0;
    }
  }
};

function modelGeometrisi({ boyut: [sx, sy, sz], al, duvaraDayali }) {
  const sinirli = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) ? 0 : al(x, y, z);
  const g = hacimdenGeometri(sx, sy, sz, sinirli, (k) => ({ rgb: RENK[k], isikMi: k === ISIK_KODU }));
  g.translate(-sx / 2, 0, duvaraDayali ? 0 : -sz / 2);
  g.scale(VOKSEL, VOKSEL, VOKSEL);
  g.computeBoundingSphere();
  return g;
}

// ---------------- Yerleştirme ----------------

function osmTuru(t) {
  if (t.entrance) return 'giris';
  if (t.amenity === 'bench') return 'bank';
  if (t.amenity === 'waste_basket') return 'cop';
  if (t.amenity === 'drinking_water') return 'cesme';
  if (t.amenity === 'bicycle_parking') return 'bisiklet';
  if (t.leisure === 'picnic_table') return 'piknik';
  if (t.highway === 'street_lamp') return 'lamba';
  // Duvar resmi ve kabartmalar haritada ayrı bir nesne değil
  if (t.tourism === 'artwork' && !['mural', 'relief'].includes(t.artwork_type)) return 'heykel';
  if (t.historic === 'memorial' || t.historic === 'monument') return 'heykel';
  return null;
}

export async function elleEklenenleriYukle() {
  try {
    const yanit = await fetch('data/elle-eklenen.json');
    if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
    return (await yanit.json()).nesneler || [];
  } catch (hata) {
    console.warn('data/elle-eklenen.json okunamadı:', hata);
    return [];
  }
}

const YONLER = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // modelin +z'si bu yöne döner

// OSM ve elle eklenen nesneleri doluluk ızgarasına uyarak yerleştirir.
// Döner: { tur: [{ x, z, yon }] }; yon YONLER'in sırası
export function nesneYerleriniSec(osm, elleEklenenler, zeminIzgarasi, doluluk) {
  const { genislik, derinlik, zemin } = zeminIzgarasi;
  const rng = rastgeleUretici(2024);
  const yerler = Object.fromEntries(Object.keys(MODELLER).map(t => [t, []]));
  const icinde = (i, j) => i >= 0 && j >= 0 && i < genislik && j < derinlik;
  const deger = (i, j) => doluluk.dolu[j * genislik + i];
  const engel = (d) => d === DOLU.BINA || d === DOLU.TABELA || d === DOLU.NESNE;

  const adaylar = osm.elements
    .filter(o => o.type === 'node' && o.tags)
    .map(o => ({ tur: osmTuru(o.tags), ...enlemBoylamdanBloga(o.lat, o.lon) }))
    .filter(a => a.tur);
  for (const e of elleEklenenler) {
    if (MODELLER[e.tur]) adaylar.push({ tur: e.tur, ...enlemBoylamdanBloga(e.enlem, e.boylam) });
  }

  for (const a of adaylar) {
    const i = Math.floor(a.x), j = Math.floor(a.z);
    if (!icinde(i, j)) continue;

    if (a.tur === 'giris') {
      // Kapı bina kenarına: içerisi bina, dışarısı boş olan ilk yönde; eşik dış hücreye
      let bulundu = false;
      for (const [r, c] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const bi = i + r, bj = j + c;
        if (!icinde(bi, bj) || deger(bi, bj) !== DOLU.BINA) continue;
        for (let y = 0; y < 4 && !bulundu; y++) {
          const [dx, dz] = YONLER[y];
          const di = bi + dx, dj = bj + dz;
          if (!icinde(di, dj) || engel(deger(di, dj))) continue;
          // Model z=0'da duvara dayansın: hücreler arası sınır
          yerler.giris.push({ x: bi + 0.5 + dx * 0.5, z: bj + 0.5 + dz * 0.5, yon: y });
          doluluk.isaretle(di, dj, DOLU.NESNE);
          bulundu = true;
        }
        if (bulundu) break;
      }
      continue;
    }

    // Bina, tabela ya da başka nesne üstündeyse en yakın boş hücreye kaydır (en fazla 2 hücre)
    let yer = null;
    for (let r = 0; r <= 2 && !yer; r++) {
      for (let b = -r; b <= r && !yer; b++) for (let c = -r; c <= r; c++) {
        if (Math.max(Math.abs(b), Math.abs(c)) !== r) continue;
        if (icinde(i + c, j + b) && !engel(deger(i + c, j + b))) { yer = [i + c, j + b]; break; }
      }
    }
    if (!yer) continue;
    const [yi, yj] = yer;
    // Banklar en yakın yürüme yoluna baksın; diğerleri rastgele yönde
    let yon = Math.floor(rng() * 4);
    if (a.tur === 'bank' || a.tur === 'piknik') {
      for (let y = 0; y < 4; y++) {
        const [dx, dz] = YONLER[y];
        if (icinde(yi + dx, yj + dz) && zemin[(yj + dz) * genislik + yi + dx] === ZEMIN.TAS) { yon = y; break; }
      }
    }
    // Kaydırılmadıysa OSM'deki tam yer, kaydırıldıysa yeni hücrenin ortası
    const kaymadi = yi === i && yj === j;
    yerler[a.tur].push({ x: kaymadi ? a.x : yi + 0.5, z: kaymadi ? a.z : yj + 0.5, yon });
    doluluk.isaretle(yi, yj, DOLU.NESNE);
  }

  // Lambalar: yürüme yoluna komşu boş çim hücrelerine, birbirinden LAMBA_ARALIGI uzakta
  if (!yerler.lamba.length) {
    const kova = new Map();
    for (let j = 1; j < derinlik - 1 && yerler.lamba.length < EN_FAZLA_LAMBA; j++) {
      for (let i = 1; i < genislik - 1; i++) {
        const h = j * genislik + i;
        if (zemin[h] !== ZEMIN.CIM || doluluk.dolu[h] !== DOLU.BOS) continue;
        if (zemin[h - 1] !== ZEMIN.TAS && zemin[h + 1] !== ZEMIN.TAS &&
            zemin[h - genislik] !== ZEMIN.TAS && zemin[h + genislik] !== ZEMIN.TAS) continue;
        const ki = Math.floor(i / LAMBA_ARALIGI), kj = Math.floor(j / LAMBA_ARALIGI);
        let yakin = false;
        for (let b = -1; b <= 1 && !yakin; b++) for (let a = -1; a <= 1 && !yakin; a++) {
          for (const [x, z] of kova.get(`${ki + a},${kj + b}`) || []) {
            if (Math.max(Math.abs(x - i), Math.abs(z - j)) < LAMBA_ARALIGI) { yakin = true; break; }
          }
        }
        if (yakin) continue;
        const anahtar = `${ki},${kj}`;
        if (!kova.has(anahtar)) kova.set(anahtar, []);
        kova.get(anahtar).push([i, j]);
        yerler.lamba.push({ x: i + 0.5, z: j + 0.5, yon: 0 });
        doluluk.isaretle(i, j, DOLU.NESNE);
        if (yerler.lamba.length >= EN_FAZLA_LAMBA) break;
      }
    }
  }
  return yerler;
}

// ---------------- Malzeme ----------------

const koseShader = /* glsl */ `
  in vec3 renk;
  in float isik;
  out vec3 vRenk;
  out vec3 vNormal;
  out float vIsik;
  out float vDerinlik;
  void main() {
    vec4 gorus = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    vRenk = renk;
    vNormal = normal;
    vIsik = isik;
    vDerinlik = -gorus.z;
    gl_Position = projectionMatrix * gorus;
  }
`;

const parcaShader = /* glsl */ `
  precision highp float;
  uniform float gece;
  uniform vec3 sisRengi;
  uniform float sisYakin;
  uniform float sisUzak;
  in vec3 vRenk;
  in vec3 vNormal;
  in float vIsik;
  in float vDerinlik;
  out vec4 renk;
  void main() {
    vec3 n = normalize(vNormal);
    float golge = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.55 : (abs(n.x) > 0.5 ? 0.82 : 0.68));
    vec3 c = vRenk * golge;
    // Lamba camı: gündüz soluk, gece sıcak sarı ve gölgesiz parlar
    float yanik = vIsik * gece;
    c = mix(c * mix(1.0, 0.75, vIsik), vec3(1.0, 0.86, 0.5) * 1.15, yanik);
    float sis = smoothstep(sisYakin, sisUzak, vDerinlik) * (1.0 - 0.7 * yanik);
    renk = vec4(mix(c, sisRengi, sis), 1.0);
  }
`;

// Cihaz saatine göre gece mi (17:00-07:00)
const geceMi = () => { const s = new Date().getHours(); return s >= 17 || s < 7; };

export function nesneleriOlustur(yerler, gokRengi) {
  const malzeme = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: koseShader,
    fragmentShader: parcaShader,
    uniforms: {
      gece: { value: geceMi() ? 1 : 0 },
      sisRengi: { value: new THREE.Color(gokRengi).convertLinearToSRGB() },
      sisYakin: { value: 350 },
      sisUzak: { value: 1100 }
    }
  });
  const grup = new THREE.Group();
  const sayilar = {};
  let toplamUcgen = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), bir = new THREE.Vector3(1, 1, 1);
  const yukari = new THREE.Vector3(0, 1, 0);

  for (const [tur, liste] of Object.entries(yerler)) {
    sayilar[tur] = liste.length;
    if (!liste.length) continue;
    const geometri = modelGeometrisi(MODELLER[tur]);
    toplamUcgen += liste.length * geometri.index.count / 3;
    // Parçalara böl ki ekranda görünmeyen parçalar hiç çizilmesin
    const parcalar = new Map();
    for (const y of liste) {
      const anahtar = `${Math.floor(y.x / PARCA)},${Math.floor(y.z / PARCA)}`;
      if (!parcalar.has(anahtar)) parcalar.set(anahtar, []);
      parcalar.get(anahtar).push(y);
    }
    for (const parca of parcalar.values()) {
      const mesh = new THREE.InstancedMesh(geometri, malzeme, parca.length);
      parca.forEach((y, k) => {
        // +z'den YONLER[yon]'a dönüş: atan2(dx, dz)
        const [dx, dz] = YONLER[y.yon];
        q.setFromAxisAngle(yukari, Math.atan2(dx, dz));
        m.compose(p.set(y.x, 0, y.z), q, bir);
        mesh.setMatrixAt(k, m);
      });
      mesh.computeBoundingSphere();
      grup.add(mesh);
    }
  }

  let sonKontrol = 0;
  grup.userData.guncelle = (saniye) => {
    if (saniye - sonKontrol < 5) return; // saati 5 saniyede bir kontrol etmek yeter
    sonKontrol = saniye;
    malzeme.uniforms.gece.value = geceMi() ? 1 : 0;
  };
  grup.userData.sayilar = sayilar;
  grup.userData.toplamUcgen = toplamUcgen;
  return grup;
}
