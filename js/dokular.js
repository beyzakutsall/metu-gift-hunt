// 16x16 piksellik blok dokularını canvas üzerinde üretir ve tek bir doku dizisinde toplar.
// Katman sırası ZEMIN değerleriyle aynıdır; en sonda çimli yan yüz (CIM_YAN) katmanı vardır.
import * as THREE from 'three';
import { ZEMIN, ZEMIN_SAYISI } from './dunya.js';
import { rastgeleUretici } from './rastgele.js';

const BOYUT = 16;
export const KATMAN_CIM_YAN = ZEMIN_SAYISI;

const PALET = {
  cim: ['#5fa535', '#62aa38', '#68b33c', '#56992f', '#6fbd42', '#5fa535'],
  orman: ['#3f6b25', '#46772a', '#365d20', '#4e7d2c', '#3f6b25', '#5b4a2a'],
  toprak: ['#8a5a3b', '#7a4e33', '#966646', '#6b432c', '#8a5a3b'],
  asfalt: ['#4a4d52', '#55585d', '#3f4246', '#4a4d52', '#5e6166'],
  tas: ['#b9b6ae', '#c4c1b9', '#aeaba3', '#b9b6ae'],
  otopark: ['#6b6e72', '#74777b', '#6b6e72', '#62656a'],
  su: ['#2f6fd0', '#3a7be0', '#2a62bd', '#3a7be0'],
  saha: ['#4caf3c', '#55bb44', '#47a536', '#4caf3c'],
  pist: ['#b5523b', '#c05c44', '#a84a34', '#b5523b']
};

function sec(rng, palet) {
  return palet[Math.floor(rng() * palet.length)];
}

// Her doku: (x, y, rng) → renk. Döşeme dokularında 8 pikselde bir derz çizgisi var (bloğa 2x2 taş)
const DOKU_CIZICILERI = {
  [ZEMIN.CIM]: (x, y, rng) => sec(rng, PALET.cim),
  [ZEMIN.ORMAN]: (x, y, rng) => sec(rng, PALET.orman),
  [ZEMIN.TOPRAK]: (x, y, rng) => sec(rng, PALET.toprak),
  [ZEMIN.ASFALT]: (x, y, rng) => sec(rng, PALET.asfalt),
  [ZEMIN.TAS]: (x, y, rng) => (x % 8 === 0 || y % 8 === 0) ? '#97948c' : sec(rng, PALET.tas),
  [ZEMIN.OTOPARK]: (x, y, rng) => sec(rng, PALET.otopark),
  [ZEMIN.SU]: (x, y, rng) => rng() < 0.1 ? '#6aa8f5' : sec(rng, PALET.su),
  [ZEMIN.SAHA]: (x, y, rng) => sec(rng, PALET.saha),
  [ZEMIN.PIST]: (x, y, rng) => sec(rng, PALET.pist),
  // Üstte çim şeridi, altında toprak; geçiş satırı düzensiz
  [KATMAN_CIM_YAN]: (x, y, rng) => {
    if (y < 3 || (y === 3 && rng() < 0.5)) return sec(rng, PALET.cim);
    return sec(rng, PALET.toprak);
  }
};

function dokuCiz(tohum, cizici) {
  const tuval = document.createElement('canvas');
  tuval.width = tuval.height = BOYUT;
  const ctx = tuval.getContext('2d');
  const rng = rastgeleUretici(tohum);
  for (let y = 0; y < BOYUT; y++) {
    for (let x = 0; x < BOYUT; x++) {
      ctx.fillStyle = cizici(x, y, rng);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return ctx.getImageData(0, 0, BOYUT, BOYUT).data;
}

export function zeminDokulariniOlustur(anizotropi = 1) {
  const katmanSayisi = ZEMIN_SAYISI + 1;
  const katmanBoyutu = BOYUT * BOYUT * 4;
  const veri = new Uint8Array(katmanBoyutu * katmanSayisi);

  for (let katman = 0; katman < katmanSayisi; katman++) {
    veri.set(dokuCiz(1000 + katman, DOKU_CIZICILERI[katman]), katman * katmanBoyutu);
  }

  const doku = new THREE.DataArrayTexture(veri, BOYUT, BOYUT, katmanSayisi);
  doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
  doku.magFilter = THREE.NearestFilter;         // yakından keskin pikseller
  doku.minFilter = THREE.LinearMipmapLinearFilter; // uzaktan titremesin
  doku.generateMipmaps = true;
  doku.anisotropy = anizotropi;
  doku.needsUpdate = true;
  return doku;
}

// ---- Bina dokuları ----
// Duvarlarda her blok bir kat yüksekliğinde (≈3 m) ve ortasında bir pencere var.
// Katman sırası BINA_DOKU değerleriyle aynıdır.
export const BINA_DOKU = {
  BETON: 0,       // ODTÜ'nün brüt beton binaları
  SIVA: 1,        // apartman ve yurtlar: açık renk sıva
  TUGLA: 2,       // müstakil evler
  CAM: 3,         // Teknokent ofisleri: cam cephe
  CATI_DUZ: 4,    // düz çatı: çakıl
  CATI_KIREMIT: 5 // müstakil ev çatısı: kiremit
};
const BINA_DOKU_SAYISI = 6;

const BINA_PALET = {
  beton: ['#c2bdb2', '#cbc6bb', '#bab5aa', '#c6c1b6', '#bfbaaf'],
  siva: ['#e3d9c3', '#ddd2bb', '#e8dfca', '#d8cdb5'],
  tugla: ['#9b4a32', '#a8553a', '#8e432d', '#a14f36'],
  harc: '#c9bfae',
  cam: ['#4f7fa6', '#5a8bb3', '#46749a'],
  pencere: ['#2c4055', '#33495f', '#263a4d'],
  cerceve: '#e9e7e2',
  cakil: ['#5f5e5b', '#676662', '#575653', '#6d6c68'],
  kiremit: ['#a8432c', '#b54c33', '#9c3d28']
};

// Duvarın ortasındaki pencere: x 4..11, y 3..11 arası; açık renk çerçeve, köşesinde parlama
function pencereli(duvar) {
  return (x, y, rng) => {
    const iceri = x >= 5 && x <= 10 && y >= 4 && y <= 10;
    const cerceve = x >= 4 && x <= 11 && y >= 3 && y <= 11;
    if (iceri) return (x === 6 && y === 5) || (x === 7 && y === 5) || (x === 6 && y === 6)
      ? '#7d97ad' : sec(rng, BINA_PALET.pencere);
    if (cerceve) return BINA_PALET.cerceve;
    return duvar(x, y, rng);
  };
}

const BINA_CIZICILERI = {
  // Brüt beton: kalıp izleri gibi 4 pikselde bir hafif yatay çizgi
  [BINA_DOKU.BETON]: pencereli((x, y, rng) => (y % 4 === 0 && rng() < 0.6) ? '#aaa59a' : sec(rng, BINA_PALET.beton)),
  [BINA_DOKU.SIVA]: pencereli((x, y, rng) => sec(rng, BINA_PALET.siva)),
  // Tuğla: 4 piksel yükseklikte sıralar, alt alta kaydırılmış derzler
  [BINA_DOKU.TUGLA]: pencereli((x, y, rng) => {
    if (y % 4 === 3) return BINA_PALET.harc;
    const kayma = (Math.floor(y / 4) % 2) * 4;
    if ((x + kayma) % 8 === 7) return BINA_PALET.harc;
    return sec(rng, BINA_PALET.tugla);
  }),
  // Cam cephe: her blok 2x2 cam panel, ince açık çerçeveler
  [BINA_DOKU.CAM]: (x, y, rng) => (x % 8 === 0 || y % 8 === 0) ? '#c9d3dc' : sec(rng, BINA_PALET.cam),
  [BINA_DOKU.CATI_DUZ]: (x, y, rng) => sec(rng, BINA_PALET.cakil),
  // Kiremit: 4 piksellik sıralar, her sıranın altı koyu
  [BINA_DOKU.CATI_KIREMIT]: (x, y, rng) => (y % 4 === 3) ? '#7e3020' : sec(rng, BINA_PALET.kiremit)
};

export function binaDokulariniOlustur(anizotropi = 1) {
  const katmanBoyutu = BOYUT * BOYUT * 4;
  const veri = new Uint8Array(katmanBoyutu * BINA_DOKU_SAYISI);
  for (let katman = 0; katman < BINA_DOKU_SAYISI; katman++) {
    veri.set(dokuCiz(2000 + katman, BINA_CIZICILERI[katman]), katman * katmanBoyutu);
  }
  const doku = new THREE.DataArrayTexture(veri, BOYUT, BOYUT, BINA_DOKU_SAYISI);
  doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
  doku.magFilter = THREE.NearestFilter;
  doku.minFilter = THREE.LinearMipmapLinearFilter;
  doku.generateMipmaps = true;
  doku.anisotropy = anizotropi;
  doku.needsUpdate = true;
  return doku;
}
