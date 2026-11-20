// Bina tabelaları: her adlandırılmış binanın önüne Minecraft tabelası gibi ahşap bir direk ve
// pano dikilir; panonun ön yüzünde binanın kısa adı piksel yazıyla okunur.
// Yer: binanın OSM giriş düğümü varsa onun önü, yoksa en yakın yürüme yoluna bakan kenarı.
// Tabela 3 hücre genişliğindedir; bu hücreler bina, yol ve başka tabela/nesne hücresi olamaz.
// Bütün tabelalar tek geometride, bütün yazılar tek doku atlasında: tek çizim çağrısı.
import * as THREE from 'three';
import { ZEMIN } from './dunya.js';
import { enlemBoylamdanBloga } from './projeksiyon.js';
import { DOLU } from './doluluk.js';
import { rastgeleUretici } from './rastgele.js';
import { pikselYaziCiz, pikselDokusu } from './piksel-yazi.js';

const PANO_GENISLIK = 3;     // blok
const PANO_YUKSEKLIK = 1.25;
const PANO_KALINLIK = 0.15;
const DIREK_BOYU = 1.1;      // panonun alt kenarı bu yükseklikte
const DIREK_KALINLIK = 0.25;
const AYNI_AD_MESAFESI = 25; // aynı adlı binalar (Konukevi gibi) bu kadar yakınsa tek tabela

// Dört yön: tabelanın baktığı taraf (bina arkada kalır)
const YONLER = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// En yakın yürüme yolu (TAS) hücresine 4 komşulu adım sayısı; 255'te kesilir
function yolMesafesi(zeminIzgarasi) {
  const { genislik, derinlik, zemin } = zeminIzgarasi;
  const mesafe = new Uint8Array(genislik * derinlik).fill(255);
  let kuyruk = [];
  for (let h = 0; h < zemin.length; h++) if (zemin[h] === ZEMIN.TAS) { mesafe[h] = 0; kuyruk.push(h); }
  for (let d = 1; d < 255 && kuyruk.length; d++) {
    const sonraki = [];
    for (const h of kuyruk) {
      const i = h % genislik;
      const komsular = [i > 0 ? h - 1 : -1, i < genislik - 1 ? h + 1 : -1, h - genislik, h + genislik];
      for (const q of komsular) {
        if (q < 0 || q >= mesafe.length || mesafe[q] !== 255) continue;
        mesafe[q] = d;
        sonraki.push(q);
      }
    }
    kuyruk = sonraki;
  }
  return mesafe;
}

export function girisleriBul(osm) {
  return osm.elements
    .filter(o => o.type === 'node' && o.tags?.entrance)
    .map(o => enlemBoylamdanBloga(o.lat, o.lon));
}

// Her bina için en iyi tabela yerini seçer ve doluluk ızgarasına işaretler.
// Döner: [{ bina, i, j, yon: [dx, dz] }]; tabela (i, j) hücresinin ortasında, yon tarafına bakar
export function tabelaYerleriniSec(binalar, girisler, zeminIzgarasi, doluluk) {
  const { genislik, derinlik } = zeminIzgarasi;
  const yolUzakligi = yolMesafesi(zeminIzgarasi);
  const binaNo = new Int32Array(genislik * derinlik).fill(-1);
  binalar.forEach((b, n) => { for (const h of b.hucreler) binaNo[h] = n; });

  // Girişleri, 2 hücre içindeki binaya bağla
  const binaGirisleri = new Map();
  for (const g of girisler) {
    const gi = Math.floor(g.x), gj = Math.floor(g.z);
    let bulunan = -1;
    for (let r = 0; r <= 2 && bulunan < 0; r++) {
      for (let b = -r; b <= r && bulunan < 0; b++) for (let a = -r; a <= r; a++) {
        const i = gi + a, j = gj + b;
        if (i < 0 || j < 0 || i >= genislik || j >= derinlik) continue;
        if (binaNo[j * genislik + i] >= 0) { bulunan = binaNo[j * genislik + i]; break; }
      }
    }
    if (bulunan < 0) continue;
    if (!binaGirisleri.has(bulunan)) binaGirisleri.set(bulunan, []);
    binaGirisleri.get(bulunan).push(g);
  }

  const bosMu = (i, j) => i >= 0 && j >= 0 && i < genislik && j < derinlik && doluluk.dolu[j * genislik + i] === DOLU.BOS;
  // Önemliler ve büyükler önce: en iyi yerleri onlar alsın
  const sira = binalar.map((b, n) => n).sort((p, q) => (binalar[q].onemli - binalar[p].onemli) || (binalar[q].alan - binalar[p].alan));
  const yerler = [];

  for (const n of sira) {
    const bina = binalar[n];
    if (yerler.some(y => y.bina.ad === bina.ad &&
        Math.hypot(y.i - bina.merkez.x, y.j - bina.merkez.z) < AYNI_AD_MESAFESI)) continue;
    const girisler = binaGirisleri.get(n);

    let enIyi = null, enIyiPuan = Infinity;
    for (const h of bina.hucreler) {
      const hi = h % genislik, hj = (h - hi) / genislik;
      for (const [dx, dz] of YONLER) {
        for (let k = 1; k <= 2; k++) {
          const i = hi + dx * k, j = hj + dz * k;
          // Arada başka bina olmasın; pano yönüne dik 3 hücre ve önü boş olsun
          if (k === 2 && binaNo[(hj + dz) * genislik + hi + dx] >= 0) break;
          const ti = dz, tj = dx; // panonun uzandığı eksen (yöne dik)
          if (!bosMu(i, j) || !bosMu(i + ti, j + tj) || !bosMu(i - ti, j - tj)) continue;
          const oi = i + dx, oj = j + dz;
          if (oi < 0 || oj < 0 || oi >= genislik || oj >= derinlik || doluluk.dolu[oj * genislik + oi] === DOLU.BINA) continue;

          let puan;
          if (girisler) {
            puan = Math.min(...girisler.map(g => Math.hypot(g.x - (i + 0.5), g.z - (j + 0.5))));
          } else {
            // Önündeki hücre yola ne kadar yakınsa o kadar iyi: tabela yürüme yoluna baksın
            puan = yolUzakligi[oj * genislik + oi] + 0.5 * yolUzakligi[j * genislik + i];
          }
          puan += k * 0.1;
          if (puan < enIyiPuan) { enIyiPuan = puan; enIyi = { bina, i, j, yon: [dx, dz] }; }
        }
      }
    }
    if (!enIyi) continue;
    const [dx, dz] = enIyi.yon;
    for (const e of [-1, 0, 1]) doluluk.isaretle(enIyi.i + dz * e, enIyi.j + dx * e, DOLU.TABELA);
    yerler.push(enIyi);
  }
  return yerler;
}

// ---------------- Doku atlası ----------------

const YUVA_G = 96, YUVA_Y = 40, YUVA_ARA = 4; // atlastaki her tabelanın piksel boyutu ve aralığı

// Her tabelaya ahşap tahta deseni ve üstüne koyu piksel yazı çizer
function atlasCiz(adlar) {
  const sutun = 10;
  const satir = Math.ceil(adlar.length / sutun);
  const tuval = document.createElement('canvas');
  tuval.width = sutun * (YUVA_G + YUVA_ARA);
  tuval.height = Math.max(1, satir) * (YUVA_Y + YUVA_ARA);
  const ctx = tuval.getContext('2d');
  const rng = rastgeleUretici(77);
  const ahsap = ['#a57b48', '#9a7142', '#ad8350', '#93693c'];
  ctx.fillStyle = ahsap[0];
  ctx.fillRect(0, 0, tuval.width, tuval.height);

  const yuvalar = adlar.map((ad, k) => {
    const x = (k % sutun) * (YUVA_G + YUVA_ARA) + YUVA_ARA / 2;
    const y = Math.floor(k / sutun) * (YUVA_Y + YUVA_ARA) + YUVA_ARA / 2;
    // Yatay tahtalar, piksel piksel ton farkı ve koyu çerçeve
    for (let py = 0; py < YUVA_Y; py += 2) for (let px = 0; px < YUVA_G; px += 2) {
      ctx.fillStyle = ahsap[Math.floor(rng() * ahsap.length)];
      ctx.fillRect(x + px, y + py, 2, 2);
    }
    ctx.fillStyle = '#6e4d28';
    for (let py = 10; py < YUVA_Y; py += 10) ctx.fillRect(x, y + py, YUVA_G, 1);
    ctx.strokeStyle = '#5a3d1e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, YUVA_G - 2, YUVA_Y - 2);
    pikselYaziCiz(ctx, ad, { x: x + 3, y: y + 3, w: YUVA_G - 6, h: YUVA_Y - 6 }, { renk: '#24160a', enBuyukPunto: 14, enKucukPunto: 8 });
    return { x, y };
  });
  return { tuval, yuvalar };
}

// ---------------- Geometri ve malzeme ----------------

const koseShader = /* glsl */ `
  in vec3 renk;
  in float dokulu;
  out vec3 vRenk;
  out vec3 vNormal;
  out vec2 vUv;
  out float vDokulu;
  out float vDerinlik;
  void main() {
    vec4 gorus = viewMatrix * modelMatrix * vec4(position, 1.0);
    vRenk = renk;
    vNormal = normal;
    vUv = uv;
    vDokulu = dokulu;
    vDerinlik = -gorus.z;
    gl_Position = projectionMatrix * gorus;
  }
`;

const parcaShader = /* glsl */ `
  precision highp float;
  uniform sampler2D atlas;
  uniform vec3 sisRengi;
  uniform float sisYakin;
  uniform float sisUzak;
  in vec3 vRenk;
  in vec3 vNormal;
  in vec2 vUv;
  in float vDokulu;
  in float vDerinlik;
  out vec4 renk;
  void main() {
    vec3 n = normalize(vNormal);
    float golge = n.y > 0.5 ? 1.0 : (abs(n.x) > 0.5 ? 0.86 : 0.74);
    vec3 taban = vDokulu > 0.5 ? texture(atlas, vUv).rgb : vRenk;
    // Yazılı yüz gölgeden az etkilensin ki her yönden okunsun
    vec3 c = taban * mix(golge, 1.0, vDokulu * 0.7);
    renk = vec4(mix(c, sisRengi, smoothstep(sisYakin, sisUzak, vDerinlik)), 1.0);
  }
`;

const DIREK_RENGI = [0.42, 0.29, 0.16];
const PANO_RENGI = [0.6, 0.44, 0.26];

export function tabelalariOlustur(yerler, gokRengi) {
  const { tuval, yuvalar } = atlasCiz(yerler.map(y => y.bina.ad));
  const konum = [], normal = [], renk = [], uv = [], dokulu = [], indeks = [];

  // Taban vektörleri (sag, yukari, on) cinsinden bir kutu ekler; onUv verilirse ön yüz dokulu olur
  function kutu(merkez, sag, on, yariSag, yariYuk, yariOn, rgb, onUv) {
    const yuzler = [
      { n: on, u: sag, v: [0, 1, 0], du: yariSag, dv: yariYuk, d: yariOn, dokulu: !!onUv },
      { n: on.map(x => -x), u: sag.map(x => -x), v: [0, 1, 0], du: yariSag, dv: yariYuk, d: yariOn },
      { n: sag, u: on.map(x => -x), v: [0, 1, 0], du: yariOn, dv: yariYuk, d: yariSag },
      { n: sag.map(x => -x), u: on, v: [0, 1, 0], du: yariOn, dv: yariYuk, d: yariSag },
      { n: [0, 1, 0], u: sag, v: on.map(x => -x), du: yariSag, dv: yariOn, d: yariYuk }
    ]; // alt yüz kuşbakışında görünmez, çizilmez
    for (const y of yuzler) {
      const ilk = konum.length / 3;
      const koseler = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      koseler.forEach(([a, b], k) => {
        for (let e = 0; e < 3; e++) konum.push(merkez[e] + y.n[e] * y.d + y.u[e] * a * y.du + y.v[e] * b * y.dv);
        normal.push(...y.n);
        renk.push(...rgb);
        dokulu.push(y.dokulu ? 1 : 0);
        if (y.dokulu) uv.push(k === 0 || k === 3 ? onUv.u0 : onUv.u1, k < 2 ? onUv.v0 : onUv.v1);
        else uv.push(0, 0);
      });
      indeks.push(ilk, ilk + 1, ilk + 2, ilk, ilk + 2, ilk + 3);
    }
  }

  yerler.forEach((y, k) => {
    const [dx, dz] = y.yon;
    const on = [dx, 0, dz];
    const sag = [dz, 0, -dx]; // tabelaya bakan kişinin sağı
    const x = y.i + 0.5, z = y.j + 0.5;
    kutu([x, DIREK_BOYU / 2, z], sag, on, DIREK_KALINLIK / 2, DIREK_BOYU / 2, DIREK_KALINLIK / 2, DIREK_RENGI);
    const yuva = yuvalar[k];
    const onUv = {
      u0: yuva.x / tuval.width, u1: (yuva.x + YUVA_G) / tuval.width,
      v0: 1 - (yuva.y + YUVA_Y) / tuval.height, v1: 1 - yuva.y / tuval.height
    };
    kutu([x, DIREK_BOYU + PANO_YUKSEKLIK / 2, z], sag, on,
      PANO_GENISLIK / 2, PANO_YUKSEKLIK / 2, PANO_KALINLIK / 2, PANO_RENGI, onUv);
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(konum, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('renk', new THREE.Float32BufferAttribute(renk, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('dokulu', new THREE.Float32BufferAttribute(dokulu, 1));
  g.setIndex(indeks);
  g.computeBoundingSphere();

  const malzeme = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: koseShader,
    fragmentShader: parcaShader,
    uniforms: {
      atlas: { value: pikselDokusu(tuval) },
      sisRengi: { value: new THREE.Color(gokRengi).convertLinearToSRGB() },
      sisYakin: { value: 350 },
      sisUzak: { value: 1100 }
    }
  });
  const mesh = new THREE.Mesh(g, malzeme);
  mesh.userData.tabelaSayisi = yerler.length;
  return mesh;
}
