// Ağaçlar: iki tür ağaç var.
// - Süslü yılbaşı ağaçları: modeller/yilbasi-agaci.vox (MagicaVoxel) dosyasından okunur ve
//   yürüme yollarının kenarındaki çimlere dikilir. Paletteki parlak sarı bloklar ışıktır, yanıp söner.
// - Sade çamlar: aynı biçimde ama süssüz; ormanlık alanları doldurur.
// Her tür tek bir geometridir ve InstancedMesh ile yüzlerce/binlerce kez çizilir. Harita
// 128x128 blokluk parçalara bölünür ki ekranda görünmeyen parçalar hiç çizilmesin.
import * as THREE from 'three';
import { ZEMIN } from './dunya.js';
import { rastgeleUretici } from './rastgele.js';

const PARCA = 128;              // parça boyutu (blok)
const SUSLU_AGAC_BOYU = 6;      // blok; 1 blok ≈ 3 m
const SADE_AGAC_BOYU = 5;
const EN_FAZLA_SUSLU = 400;

// ---------------- .vox okuyucu ----------------
// MagicaVoxel dosyasındaki ilk modelin boyutunu, voksellerini ve paletini döndürür.
// Biçim: "VOX " + sürüm, ardından iç içe parçalar (SIZE, XYZI, RGBA ...). Diğer parçalar atlanır.
export function voxOku(tampon) {
  const v = new DataView(tampon);
  const metin = (p) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
  if (metin(0) !== 'VOX ') throw new Error('Geçerli bir .vox dosyası değil');

  let boyut = null, vokseller = null, palet = null;
  let p = 8;
  while (p < tampon.byteLength) {
    const kimlik = metin(p);
    const icerik = v.getInt32(p + 4, true);
    const cocuk = v.getInt32(p + 8, true);
    const veri = p + 12;
    if (kimlik === 'MAIN') { p = veri + icerik; continue; } // çocuklarına in
    if (kimlik === 'SIZE' && !boyut) {
      boyut = { x: v.getInt32(veri, true), y: v.getInt32(veri + 4, true), z: v.getInt32(veri + 8, true) };
    } else if (kimlik === 'XYZI' && !vokseller) {
      const n = v.getInt32(veri, true);
      vokseller = new Uint8Array(tampon, veri + 4, n * 4); // x, y, z, renk
    } else if (kimlik === 'RGBA') {
      palet = [];
      for (let k = 0; k < 256; k++) {
        palet.push([v.getUint8(veri + k * 4), v.getUint8(veri + k * 4 + 1), v.getUint8(veri + k * 4 + 2)]);
      }
    }
    p = veri + icerik + cocuk;
  }
  if (!boyut || !vokseller) throw new Error('.vox dosyasında model bulunamadı');
  // Palet yoksa MagicaVoxel varsayılanı kullanılmış demektir; gri ile idare edilir
  const renk = (kod) => palet ? palet[kod - 1] : [160, 160, 160];
  return { boyut, vokseller, renk };
}

// Işık sayılan renkler: çok parlak sarı (MagicaVoxel'de ışıklar için ayrılan renk)
function isikMi([r, g, b]) {
  return r > 230 && g > 200 && b < 120;
}

// ---------------- Voksel → geometri ----------------
// Hacmi açgözlü yöntemle (greedy meshing) dörtgenlere çevirir: aynı renkteki bitişik yüzler
// tek dörtgen olur, iç yüzler hiç çizilmez. Eksenler three.js'e göre: y yukarı.
function hacimdenGeometri(sx, sy, sz, al, renkBilgisi) {
  const konum = [], normal = [], renk = [], isik = [], indeks = [];
  const boyut = [sx, sy, sz];
  const p = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, w = (d + 2) % 3;
    const maske = new Int32Array(boyut[u] * boyut[w]);

    for (const yon of [1, -1]) {
      // Alt yüzler (-y) kuşbakışı kamerada neredeyse hiç görünmez; çizilmez
      if (d === 1 && yon < 0) continue;
      for (let s = 0; s < boyut[d]; s++) {
        // Bu dilimdeki voksel dolu ve yüz yönündeki komşusu boşsa yüz görünür
        let n = 0;
        for (let b = 0; b < boyut[w]; b++) {
          for (let a = 0; a < boyut[u]; a++) {
            p[d] = s; p[u] = a; p[w] = b;
            const k = al(p[0], p[1], p[2]);
            p[d] = s + yon;
            maske[n++] = (k && !al(p[0], p[1], p[2])) ? k : 0;
          }
        }
        // Maskede aynı renkli dikdörtgenleri bul
        n = 0;
        for (let b = 0; b < boyut[w]; b++) {
          for (let a = 0; a < boyut[u]; ) {
            const k = maske[n];
            if (!k) { a++; n++; continue; }
            let gen = 1;
            while (a + gen < boyut[u] && maske[n + gen] === k) gen++;
            let yuk = 1;
            dis: while (b + yuk < boyut[w]) {
              for (let e = 0; e < gen; e++) if (maske[n + e + yuk * boyut[u]] !== k) break dis;
              yuk++;
            }
            for (let yy = 0; yy < yuk; yy++) maske.fill(0, n + yy * boyut[u], n + yy * boyut[u] + gen);

            const duzlem = yon > 0 ? s + 1 : s;
            const kose = (aa, bb) => { const c = [0, 0, 0]; c[d] = duzlem; c[u] = aa; c[w] = bb; return c; };
            let koseler = [kose(a, b), kose(a + gen, b), kose(a + gen, b + yuk), kose(a, b + yuk)];
            // u × w ekseni zaten +d yönünü verir; -d yüzlerinde sıra ters çevrilir
            if (yon < 0) koseler = [koseler[0], koseler[3], koseler[2], koseler[1]];
            const nrm = [0, 0, 0]; nrm[d] = yon;
            const { rgb, isikMi } = renkBilgisi(k);
            const ilk = konum.length / 3;
            for (const c of koseler) {
              konum.push(c[0], c[1], c[2]);
              normal.push(nrm[0], nrm[1], nrm[2]);
              renk.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
              isik.push(isikMi ? 1 : 0);
            }
            indeks.push(ilk, ilk + 1, ilk + 2, ilk, ilk + 2, ilk + 3);
            a += gen; n += gen;
          }
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(konum, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('renk', new THREE.Float32BufferAttribute(renk, 3));
  g.setAttribute('isik', new THREE.Float32BufferAttribute(isik, 1));
  g.setIndex(indeks);
  return g;
}

// .vox modelini geometriye çevirir; ağacın tabanı orijinde, boyu hedefBoy blok olur
function voxtanGeometri(vox, hedefBoy) {
  const { vokseller, renk } = vox;
  // Sadece dolu bölgenin sınırları (MagicaVoxel'de model kutusunun içi boş kalabilir)
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < vokseller.length; k += 4) {
    for (let e = 0; e < 3; e++) {
      min[e] = Math.min(min[e], vokseller[k + e]);
      max[e] = Math.max(max[e], vokseller[k + e]);
    }
  }
  // MagicaVoxel: z yukarı. three.js: y yukarı → (x, z, y)
  const sx = max[0] - min[0] + 1, sy = max[2] - min[2] + 1, sz = max[1] - min[1] + 1;
  const hacim = new Uint8Array(sx * sy * sz);
  for (let k = 0; k < vokseller.length; k += 4) {
    const x = vokseller[k] - min[0], y = vokseller[k + 2] - min[2], z = vokseller[k + 1] - min[1];
    hacim[x + sx * (y + sy * z)] = vokseller[k + 3];
  }
  const al = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) ? 0 : hacim[x + sx * (y + sy * z)];
  const onbellek = new Map();
  const renkBilgisi = (k) => {
    if (!onbellek.has(k)) { const rgb = renk(k); onbellek.set(k, { rgb, isikMi: isikMi(rgb) }); }
    return onbellek.get(k);
  };

  const g = hacimdenGeometri(sx, sy, sz, al, renkBilgisi);
  const olcek = hedefBoy / sy;
  g.translate(-sx / 2, 0, -sz / 2);
  g.scale(olcek, olcek, olcek);
  g.computeBoundingSphere();
  return g;
}

// Sade çam: binlerce kez çizildiği için olabildiğince az yüzlü, Minecraft ladini gibi
// basamaklı bir koni: gövde, 5x5, iki kat 3x3 ve tepede tek blok
function sadeCamGeometrisi(hedefBoy) {
  const S = 5, Y = 7, M = 2;
  const KOYU = 2, ACIK = 3, GOVDE = 1;
  const al = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= S || y >= Y || z >= S) return 0;
    const dx = Math.abs(x - M), dz = Math.abs(z - M);
    if (y <= 1) return (!dx && !dz) ? GOVDE : 0;
    if (y <= 3) return (dx <= 2 && dz <= 2) ? KOYU : 0;
    if (y <= 5) return (dx <= 1 && dz <= 1) ? KOYU : 0;
    return (!dx && !dz) ? ACIK : 0;
  };
  const renkler = { [GOVDE]: [110, 72, 40], [KOYU]: [40, 96, 48], [ACIK]: [56, 124, 56] };
  const g = hacimdenGeometri(S, Y, S, al, (k) => ({ rgb: renkler[k], isikMi: false }));
  const olcek = hedefBoy / Y;
  g.translate(-S / 2, 0, -S / 2);
  g.scale(olcek, olcek, olcek);
  g.computeBoundingSphere();
  return g;
}

// ---------------- Yerleştirme ----------------

// Süslü ağaçlar: yürüme yolunun 1-2 blok yanındaki çim, binalardan en az 3 blok uzakta,
// birbirinden en az 10 blok aralıklı
function susluAgacYerleri(zeminIzgarasi, binaIzgarasi) {
  const { genislik, derinlik, zemin } = zeminIzgarasi;
  const { yukseklik } = binaIzgarasi;
  const rng = rastgeleUretici(1225);
  const ARALIK = 10;
  const kova = new Map(); // ARALIK boyutlu hücrelerde, yakın ağaç var mı diye bakmak için
  const yerler = [];

  const bak = (i, j, r, kosul) => {
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
      const x = i + a, z = j + b;
      if (x < 0 || z < 0 || x >= genislik || z >= derinlik) continue;
      if (kosul(z * genislik + x)) return true;
    }
    return false;
  };

  // Hücreleri karışık sırayla dene ki ağaçlar haritanın bir köşesinde toplanmasın
  const adaylar = [];
  for (let j = 2; j < derinlik - 2; j += 2) for (let i = 2; i < genislik - 2; i += 2) adaylar.push(j * genislik + i);
  for (let k = adaylar.length - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1));
    [adaylar[k], adaylar[r]] = [adaylar[r], adaylar[k]];
  }

  for (const h of adaylar) {
    if (yerler.length >= EN_FAZLA_SUSLU) break;
    const i = h % genislik, j = (h - i) / genislik;
    if (zemin[h] !== ZEMIN.CIM || yukseklik[h]) continue;
    if (bak(i, j, 1, (q) => zemin[q] !== ZEMIN.CIM)) continue;        // ağaç tam yolun üstüne binmesin
    if (!bak(i, j, 2, (q) => zemin[q] === ZEMIN.TAS)) continue;        // ama yürüme yoluna yakın olsun
    if (bak(i, j, 3, (q) => yukseklik[q] > 0)) continue;               // binaya gömülmesin

    const ki = Math.floor(i / ARALIK), kj = Math.floor(j / ARALIK);
    let yakin = false;
    for (let b = -1; b <= 1 && !yakin; b++) for (let a = -1; a <= 1 && !yakin; a++) {
      for (const [x, z] of kova.get(`${ki + a},${kj + b}`) || []) {
        if ((x - i) ** 2 + (z - j) ** 2 < ARALIK * ARALIK) { yakin = true; break; }
      }
    }
    if (yakin) continue;
    const anahtar = `${ki},${kj}`;
    if (!kova.has(anahtar)) kova.set(anahtar, []);
    kova.get(anahtar).push([i, j]);
    yerler.push({ x: i + 0.5, z: j + 0.5 });
  }
  return yerler;
}

// Sade çamlar: orman zemininde, 6 blokluk ızgarada rastgele kaydırılarak, yarı olasılıkla
function sadeAgacYerleri(zeminIzgarasi, binaIzgarasi) {
  const { genislik, derinlik, zemin } = zeminIzgarasi;
  const { yukseklik } = binaIzgarasi;
  const rng = rastgeleUretici(1903);
  const ADIM = 6;
  const yerler = [];
  for (let j = 0; j < derinlik; j += ADIM) {
    for (let i = 0; i < genislik; i += ADIM) {
      if (rng() > 0.6) continue;
      const x = Math.min(genislik - 1, i + Math.floor(rng() * ADIM));
      const z = Math.min(derinlik - 1, j + Math.floor(rng() * ADIM));
      const h = z * genislik + x;
      if (zemin[h] !== ZEMIN.ORMAN || yukseklik[h]) continue;
      yerler.push({ x: x + 0.5, z: z + 0.5 });
    }
  }
  return yerler;
}

// ---------------- Malzeme ----------------

const koseShader = /* glsl */ `
  in vec3 renk;
  in float isik;
  uniform float zaman;
  out vec3 vRenk;
  out vec3 vNormal;
  out float vIsik;
  out float vParilti;
  out float vDerinlik;

  void main() {
    vec4 dunya = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 gorus = viewMatrix * dunya;
    vRenk = renk;
    #ifdef USE_INSTANCING_COLOR
      vRenk *= instanceColor; // sade çamlarda ağaçtan ağaca hafif ton farkı
    #endif
    vNormal = normal;
    vIsik = isik;
    // Her ışık kendi temposunda yanıp söner: ağacın ve bloğun konumundan bir faz
    float faz = dot(floor(dunya.xyz * 3.0), vec3(1.7, 2.3, 3.1));
    vParilti = 0.5 + 0.5 * sin(zaman * 3.0 + faz);
    vDerinlik = -gorus.z;
    gl_Position = projectionMatrix * gorus;
  }
`;

const parcaShader = /* glsl */ `
  precision highp float;
  uniform vec3 sisRengi;
  uniform float sisYakin;
  uniform float sisUzak;
  in vec3 vRenk;
  in vec3 vNormal;
  in float vIsik;
  in float vParilti;
  in float vDerinlik;
  out vec4 renk;

  void main() {
    vec3 n = normalize(vNormal);
    float golge = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.55 : (abs(n.x) > 0.5 ? 0.82 : 0.68));
    vec3 c = vRenk * golge;
    // Işıklar gölgeden etkilenmez; sönükken bile biraz parlar
    c = mix(c, vRenk * (0.45 + 0.75 * vParilti), vIsik);
    float sis = smoothstep(sisYakin, sisUzak, vDerinlik) * (1.0 - 0.6 * vIsik);
    renk = vec4(mix(c, sisRengi, sis), 1.0);
  }
`;

function agacMalzemesi(gokRengi) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: koseShader,
    fragmentShader: parcaShader,
    uniforms: {
      zaman: { value: 0 },
      sisRengi: { value: new THREE.Color(gokRengi).convertLinearToSRGB() },
      sisYakin: { value: 350 },
      sisUzak: { value: 1100 }
    }
  });
}

// Yerleri parçalara bölüp her parça için bir InstancedMesh kurar
function orman(geometri, malzeme, yerler, rng, renkFarki) {
  const grup = new THREE.Group();
  const parcalar = new Map();
  for (const y of yerler) {
    const anahtar = `${Math.floor(y.x / PARCA)},${Math.floor(y.z / PARCA)}`;
    if (!parcalar.has(anahtar)) parcalar.set(anahtar, []);
    parcalar.get(anahtar).push(y);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const yukari = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  for (const liste of parcalar.values()) {
    const mesh = new THREE.InstancedMesh(geometri, malzeme, liste.length);
    liste.forEach((y, k) => {
      // Her ağaç 90°'nin katları kadar döner ve boyu biraz değişir: orman tekdüze görünmesin
      q.setFromAxisAngle(yukari, Math.floor(rng() * 4) * Math.PI / 2);
      const o = 0.85 + rng() * 0.3;
      m.compose(p.set(y.x, 0, y.z), q, s.set(o, o, o));
      mesh.setMatrixAt(k, m);
      if (renkFarki) mesh.setColorAt(k, c.setScalar(0.85 + rng() * 0.25));
    });
    mesh.computeBoundingSphere();
    grup.add(mesh);
  }
  return grup;
}

// ---------------- Dışa açılan ----------------

export async function agaclariOlustur(zeminIzgarasi, binaIzgarasi, gokRengi) {
  const malzeme = agacMalzemesi(gokRengi);
  const rng = rastgeleUretici(42);
  const grup = new THREE.Group();

  const sadeYerler = sadeAgacYerleri(zeminIzgarasi, binaIzgarasi);
  const sadeGeometri = sadeCamGeometrisi(SADE_AGAC_BOYU);
  grup.add(orman(sadeGeometri, malzeme, sadeYerler, rng, true));
  let toplamDortgen = sadeYerler.length * sadeGeometri.index.count / 6;

  let susluSayisi = 0;
  try {
    const yanit = await fetch('modeller/yilbasi-agaci.vox');
    if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
    const vox = voxOku(await yanit.arrayBuffer());
    const susluYerler = susluAgacYerleri(zeminIzgarasi, binaIzgarasi);
    const susluGeometri = voxtanGeometri(vox, SUSLU_AGAC_BOYU);
    grup.add(orman(susluGeometri, malzeme, susluYerler, rng, false));
    susluSayisi = susluYerler.length;
    toplamDortgen += susluSayisi * susluGeometri.index.count / 6;
  } catch (hata) {
    // Model okunamazsa harita yine açılsın, sadece süslü ağaçlar eksik kalsın
    console.warn('Yılbaşı ağacı modeli yüklenemedi:', hata);
  }

  console.info(`Ağaçlar: ${sadeYerler.length} çam (${sadeGeometri.index.count / 6} dörtgen/ağaç), ${susluSayisi} süslü yılbaşı ağacı, toplam ${toplamDortgen} dörtgen`);
  grup.userData.guncelle = (saniye) => { malzeme.uniforms.zaman.value = saniye; };
  return grup;
}
