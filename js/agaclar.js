// Ağaçlar: iki tür ağaç var.
// - Süslü yılbaşı ağaçları: modeller/yilbasi-agaci.glb (Sketchfab, CC BY 4.0) dosyasından okunur ve
//   yürüme yollarının kenarındaki çimlere dikilir. Dokudaki parlak sarı pikseller ampuldür, yanıp söner.
//   GLB yüklenemezse modeller/yilbasi-agaci.vox (MagicaVoxel) kullanılır; orada paletteki parlak sarı
//   bloklar ışıktır.
// - Sade çamlar: voksel biçiminde ama süssüz; ormanlık alanları doldurur.
// Her tür tek bir geometridir ve InstancedMesh ile yüzlerce/binlerce kez çizilir. Harita
// 128x128 blokluk parçalara bölünür ki ekranda görünmeyen parçalar hiç çizilmesin.
import * as THREE from 'three';
import { ZEMIN } from './dunya.js';
import { rastgeleUretici } from './rastgele.js';
import { DOLU } from './doluluk.js';

const PARCA = 128;              // parça boyutu (blok)
const SUSLU_AGAC_BOYU = 10;     // blok; 1 blok ≈ 3 m
const SADE_AGAC_BOYU = 5;
const EN_FAZLA_SUSLU = 400;
const EN_BUYUK_OLCEK = 1.15;    // orman() her ağacın boyunu 0.85 ile bu değer arasında değiştirir

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
export function hacimdenGeometri(sx, sy, sz, al, renkBilgisi) {
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

// ---------------- GLB → geometri ----------------
// Modeldeki tüm parçaları (hepsi aynı malzemeyi ve dokuyu kullanır) kendi konumlarıyla tek
// geometride birleştirir, böylece her harita parçası için yine tek çizim çağrısı kalır.
// Ağacın tabanı orijinde, boyu hedefBoy blok olur. Geometriyle birlikte dokuyu döndürür.
async function glbdenGeometri(adres, hedefBoy) {
  // Yükleyiciler sayfadaki three ile aynı sürümden gelir (import map'teki three/addons/)
  const [{ GLTFLoader }, { mergeGeometries }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/utils/BufferGeometryUtils.js')
  ]);
  const gltf = await new GLTFLoader().loadAsync(adres);
  gltf.scene.updateMatrixWorld(true);

  const parcalar = [];
  let doku = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    doku ??= o.material.map;
    parcalar.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  if (!doku) throw new Error('GLB modelinde doku bulunamadı');
  const g = mergeGeometries(parcalar);
  if (!g) throw new Error('GLB modelinin parçaları birleştirilemedi');

  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const olcek = hedefBoy / (max.y - min.y);
  g.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
  g.scale(olcek, olcek, olcek);
  g.computeBoundingSphere();

  // Shader renkleri dönüştürmeden ekrana basar (vox paletinde olduğu gibi); doku da ham okunmalı
  doku.colorSpace = THREE.NoColorSpace;
  return { geometri: g, doku };
}

// Ağacın kuşbakışı yarı genişliği (blok), en büyük boy farkıyla birlikte. Ağaçlar 90°'nin
// katları kadar döndüğü için taban karesi eksenlere hizalı kalır; |x| ve |z|'nin en büyüğü yeter.
function tabanYaricapi(g) {
  const p = g.attributes.position;
  let r = 0;
  for (let k = 0; k < p.count; k++) r = Math.max(r, Math.abs(p.getX(k)), Math.abs(p.getZ(k)));
  return r * EN_BUYUK_OLCEK;
}

const ucgenSayisi = (g) => g.index.count / 3;

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

// Süslü ağaçlar: tabanı (yarı genişliği yaricap blok olan kare) tamamen çimde, kenarı yürüme
// yoluna en fazla 2 blok uzakta, binalara, orman çamlarına, tabelalara ve simge nesnelere değmeden;
// tabanlar birbirine girmez
function susluAgacYerleri(zeminIzgarasi, binaIzgarasi, yaricap, doluluk) {
  const { genislik, derinlik, zemin } = zeminIzgarasi;
  const { yukseklik } = binaIzgarasi;
  const rng = rastgeleUretici(1225);
  const R = Math.ceil(yaricap - 0.5);        // ağaç hücre ortasında; tabanı i-R..i+R hücrelerine değer
  const ARALIK = Math.ceil(2 * yaricap) + 1; // merkezler arasında iki eksenden birinde en az bu kadar
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
  for (let j = R; j < derinlik - R; j += 2) for (let i = R; i < genislik - R; i += 2) adaylar.push(j * genislik + i);
  for (let k = adaylar.length - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1));
    [adaylar[k], adaylar[r]] = [adaylar[r], adaylar[k]];
  }

  for (const h of adaylar) {
    if (yerler.length >= EN_FAZLA_SUSLU) break;
    const i = h % genislik, j = (h - i) / genislik;
    if (zemin[h] !== ZEMIN.CIM || yukseklik[h]) continue;
    if (bak(i, j, R, (q) => zemin[q] !== ZEMIN.CIM)) continue;        // dalları yola taşmasın
    if (!bak(i, j, R + 2, (q) => zemin[q] === ZEMIN.TAS)) continue;    // ama yürüme yoluna yakın olsun
    if (bak(i, j, R + 1, (q) => yukseklik[q] > 0)) continue;           // binaya gömülmesin
    if (bak(i, j, R + 2, (q) => zemin[q] === ZEMIN.ORMAN)) continue;   // kenardaki çamlar da dallara girer
    if (doluluk && bak(i, j, R, (q) => doluluk.dolu[q] >= DOLU.TABELA)) continue; // tabela ve nesneler

    const ki = Math.floor(i / ARALIK), kj = Math.floor(j / ARALIK);
    let yakin = false;
    for (let b = -1; b <= 1 && !yakin; b++) for (let a = -1; a <= 1 && !yakin; a++) {
      for (const [x, z] of kova.get(`${ki + a},${kj + b}`) || []) {
        // Tabanlar eksenlere hizalı kare olduğu için mesafe de kare (Chebyshev) mesafesi
        if (Math.max(Math.abs(x - i), Math.abs(z - j)) < ARALIK) { yakin = true; break; }
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
function sadeAgacYerleri(zeminIzgarasi, binaIzgarasi, doluluk) {
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
      if (doluluk && doluluk.varMi(x, z, 2, (d) => d >= DOLU.TABELA)) continue; // tabela ve nesnelere girmesin
      yerler.push({ x: x + 0.5, z: z + 0.5 });
    }
  }
  return yerler;
}

// ---------------- Malzeme ----------------

// DOKULU tanımlıysa (GLB ağacı) renk ve ışık köşe niteliklerinden değil dokudan okunur
const koseShader = /* glsl */ `
  uniform float zaman;
  out vec3 vNormal;
  out float vDerinlik;
  #ifdef DOKULU
    out vec2 vUv;
    out vec2 vAgac;
  #else
    in vec3 renk;
    in float isik;
    out vec3 vRenk;
    out float vIsik;
    out float vParilti;
  #endif

  void main() {
    vec4 dunya = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 gorus = viewMatrix * dunya;
    vNormal = normal;
    #ifdef DOKULU
      vUv = uv;
      vAgac = instanceMatrix[3].xz;
    #else
      vRenk = renk;
      #ifdef USE_INSTANCING_COLOR
        vRenk *= instanceColor; // sade çamlarda ağaçtan ağaca hafif ton farkı
      #endif
      vIsik = isik;
      // Her ışık kendi temposunda yanıp söner: ağacın ve bloğun konumundan bir faz
      float faz = dot(floor(dunya.xyz * 3.0), vec3(1.7, 2.3, 3.1));
      vParilti = 0.5 + 0.5 * sin(zaman * 3.0 + faz);
    #endif
    vDerinlik = -gorus.z;
    gl_Position = projectionMatrix * gorus;
  }
`;

const parcaShader = /* glsl */ `
  precision highp float;
  uniform vec3 sisRengi;
  uniform float sisYakin;
  uniform float sisUzak;
  in vec3 vNormal;
  in float vDerinlik;
  #ifdef DOKULU
    uniform sampler2D doku;
    uniform float zaman;
    in vec2 vUv;
    in vec2 vAgac;
  #else
    in vec3 vRenk;
    in float vIsik;
    in float vParilti;
  #endif
  out vec4 renk;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 taban;
    float isik, parilti;
    #ifdef DOKULU
      vec4 t = texture(doku, vUv);
      if (t.a < 0.05) discard; // modelin kendi alphaCutoff değeri
      if (!gl_FrontFacing) n = -n; // iki yüzlü çizilir
      taban = t.rgb;
      // Sadece parlak sarı pikseller ampuldür; kırmızı süsler ve beyaz kar sabit kalır
      isik = (t.r > 0.9 && t.g > 0.85 && t.b < 0.75) ? 1.0 : 0.0;
      // Her ampul kendi temposunda yanıp söner: pikselin dokudaki yerinden ve ağacın konumundan bir faz
      vec2 piksel = floor(vUv * vec2(textureSize(doku, 0)));
      float faz = dot(piksel, vec2(1.7, 2.3)) + dot(floor(vAgac), vec2(3.1, 1.3));
      parilti = 0.5 + 0.5 * sin(zaman * 3.0 + faz);
    #else
      taban = vRenk;
      isik = vIsik;
      parilti = vParilti;
    #endif
    float golge = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.55 : (abs(n.x) > 0.5 ? 0.82 : 0.68));
    vec3 c = taban * golge;
    // Işıklar gölgeden etkilenmez; sönükken bile biraz parlar
    c = mix(c, taban * (0.45 + 0.75 * parilti), isik);
    float sis = smoothstep(sisYakin, sisUzak, vDerinlik) * (1.0 - 0.6 * isik);
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

// GLB ağacı için dokulu, iki yüzlü sürüm. Tekdüzen (uniform) nesneleri ortak, böylece zaman
// yalnızca asıl malzemede güncellenir
function dokuluAgacMalzemesi(malzeme, doku) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: koseShader,
    fragmentShader: parcaShader,
    defines: { DOKULU: '' },
    side: THREE.DoubleSide,
    uniforms: { ...malzeme.uniforms, doku: { value: doku } }
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
      const o = 0.85 + rng() * (EN_BUYUK_OLCEK - 0.85);
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

export async function agaclariOlustur(zeminIzgarasi, binaIzgarasi, gokRengi, doluluk = null) {
  const malzeme = agacMalzemesi(gokRengi);
  const rng = rastgeleUretici(42);
  const grup = new THREE.Group();

  const sadeYerler = sadeAgacYerleri(zeminIzgarasi, binaIzgarasi, doluluk);
  const sadeGeometri = sadeCamGeometrisi(SADE_AGAC_BOYU);
  grup.add(orman(sadeGeometri, malzeme, sadeYerler, rng, true));
  let toplamUcgen = sadeYerler.length * ucgenSayisi(sadeGeometri);

  // Süslü ağaç: önce GLB, olmazsa .vox
  let suslu = null;
  try {
    const { geometri, doku } = await glbdenGeometri('modeller/yilbasi-agaci.glb', SUSLU_AGAC_BOYU);
    suslu = { geometri, malzeme: dokuluAgacMalzemesi(malzeme, doku), kaynak: 'GLB' };
  } catch (hata) {
    console.warn('GLB yılbaşı ağacı yüklenemedi, .vox modeli kullanılacak:', hata);
    try {
      const yanit = await fetch('modeller/yilbasi-agaci.vox');
      if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
      const vox = voxOku(await yanit.arrayBuffer());
      suslu = { geometri: voxtanGeometri(vox, SUSLU_AGAC_BOYU), malzeme, kaynak: '.vox' };
    } catch (hata) {
      // Model okunamazsa harita yine açılsın, sadece süslü ağaçlar eksik kalsın
      console.warn('Yılbaşı ağacı modeli yüklenemedi:', hata);
    }
  }

  let susluBilgi = 'süslü yılbaşı ağacı yok';
  if (suslu) {
    const susluYerler = susluAgacYerleri(zeminIzgarasi, binaIzgarasi, tabanYaricapi(suslu.geometri), doluluk);
    grup.add(orman(suslu.geometri, suslu.malzeme, susluYerler, rng, false));
    toplamUcgen += susluYerler.length * ucgenSayisi(suslu.geometri);
    susluBilgi = `${susluYerler.length}/${EN_FAZLA_SUSLU} süslü yılbaşı ağacı (${suslu.kaynak}, ${ucgenSayisi(suslu.geometri)} üçgen/ağaç)`;
  }

  console.info(`Ağaçlar: ${sadeYerler.length} çam (${ucgenSayisi(sadeGeometri)} üçgen/ağaç), ${susluBilgi}, toplam ${toplamUcgen} üçgen`);
  grup.userData.guncelle = (saniye) => { malzeme.uniforms.zaman.value = saniye; };
  return grup;
}
