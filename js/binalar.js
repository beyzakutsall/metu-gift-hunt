// Binalar: OSM bina ayak izleri blok ızgarasına taranır, her hücreye bir yükseklik (kat) ve
// malzeme yazılır. Sonra yalnızca görünen yüzlerden tek bir geometri kurulur:
// üst yüzler aynı yükseklikteki komşularla dikdörtgenlere birleştirilir, yan yüzler sadece
// komşu hücre daha alçaksa çizilir. Böylece yüz binlerce blok yerine birkaç on bin dörtgen çizilir.
import * as THREE from 'three';
import { IZGARA } from './projeksiyon.js';
import { noktalaraCevir, poligonTara } from './dunya.js';
import { BINA_DOKU } from './dokular.js';

// 1 kat ≈ 3 m = 1 blok
const KAT_METRE = 3;
const EN_YUKSEK_KAT = 30;

// Yüksekliği bilinmeyen binalar için bina türüne göre tahmini kat sayısı
const VARSAYILAN_KAT = {
  apartments: 5, residential: 4, dormitory: 4, hospital: 4, office: 4,
  university: 3, school: 3, public: 3,
  commercial: 2, mosque: 2, detached: 2, house: 2, industrial: 2, warehouse: 2,
  greenhouse: 1
};

// Hücrede saklanan malzeme kodu: duvar dokusu (çatı dokusu duvara göre seçilir)
const MALZEME = { BETON: 0, SIVA: 1, TUGLA: 2, CAM: 3 };
const DUVAR_DOKUSU = [BINA_DOKU.BETON, BINA_DOKU.SIVA, BINA_DOKU.TUGLA, BINA_DOKU.CAM];
const CATI_DOKUSU = [BINA_DOKU.CATI_DUZ, BINA_DOKU.CATI_DUZ, BINA_DOKU.CATI_KIREMIT, BINA_DOKU.CATI_DUZ];

function katSayisi(t) {
  const metre = parseFloat(t.height);
  if (metre > 0) return Math.max(1, Math.round(metre / KAT_METRE));
  const kat = parseInt(t['building:levels'], 10);
  if (kat > 0) return kat;
  return VARSAYILAN_KAT[t.building] ?? 2;
}

function malzemeSec(t) {
  switch (t.building) {
    case 'detached': case 'house': return MALZEME.TUGLA;
    case 'apartments': case 'residential': case 'dormitory': return MALZEME.SIVA;
    case 'office': case 'commercial': case 'greenhouse': return MALZEME.CAM;
    default: return MALZEME.BETON; // ODTÜ binalarının çoğu brüt beton
  }
}

export function binaIzgarasiOlustur(osm) {
  const { genislik, derinlik } = IZGARA;
  const yukseklik = new Uint8Array(genislik * derinlik); // 0 = bina yok
  const malzeme = new Uint8Array(genislik * derinlik);
  let binaSayisi = 0;

  for (const oge of osm.elements) {
    const t = oge.tags || {};
    // Sadece çatıdan ibaret yapılar (sundurma, pazar yeri) ve inşaatlar atlanır
    if (!t.building || t.building === 'roof' || t.building === 'construction') continue;

    let halkalar;
    if (oge.type === 'way' && oge.geometry) {
      halkalar = [noktalaraCevir(oge.geometry)];
    } else if (oge.type === 'relation' && oge.members) {
      // İç halkalar (avlular) tek-çift kuralıyla kendiliğinden boş kalır
      halkalar = oge.members.filter(u => u.type === 'way' && u.geometry).map(u => noktalaraCevir(u.geometry));
    }
    if (!halkalar || !halkalar.length) continue;

    const kat = Math.min(EN_YUKSEK_KAT, katSayisi(t));
    const m = malzemeSec(t);
    binaSayisi++;

    // Üst üste binen binalarda yüksek olan kazanır
    poligonTara(halkalar, genislik, derinlik, (j, i0, i1) => {
      for (let i = i0; i <= i1; i++) {
        const h = j * genislik + i;
        if (kat > yukseklik[h]) {
          yukseklik[h] = kat;
          malzeme[h] = m;
        }
      }
    });
  }

  return { genislik, derinlik, yukseklik, malzeme, binaSayisi };
}

// ---- Geometri ----

function geometriKurucu() {
  const konum = [], normal = [], katman = [], indeks = [];
  return {
    // 4 köşe, dışarıdan bakınca saat yönünün tersine verilir
    dortgen(koseler, n, k) {
      const ilk = konum.length / 3;
      for (const c of koseler) {
        konum.push(c[0], c[1], c[2]);
        normal.push(n[0], n[1], n[2]);
        katman.push(k);
      }
      indeks.push(ilk, ilk + 1, ilk + 2, ilk, ilk + 2, ilk + 3);
    },
    bitir() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(konum, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
      g.setAttribute('katman', new THREE.Float32BufferAttribute(katman, 1));
      g.setIndex(indeks);
      g.computeBoundingSphere();
      return g;
    },
    dortgenSayisi: () => indeks.length / 6
  };
}

function binaGeometrisi({ genislik, derinlik, yukseklik, malzeme }) {
  const g = geometriKurucu();
  const H = (i, j) => (i < 0 || j < 0 || i >= genislik || j >= derinlik) ? 0 : yukseklik[j * genislik + i];

  // Üst yüzler: aynı yükseklik ve malzemedeki hücreler açgözlü yöntemle dikdörtgenlere birleşir
  const kullanildi = new Uint8Array(genislik * derinlik);
  for (let j = 0; j < derinlik; j++) {
    for (let i = 0; i < genislik; i++) {
      const h0 = j * genislik + i;
      const y = yukseklik[h0];
      if (!y || kullanildi[h0]) continue;
      const m = malzeme[h0];
      const ayni = h => yukseklik[h] === y && malzeme[h] === m && !kullanildi[h];

      let w = 1;
      while (i + w < genislik && ayni(h0 + w)) w++;
      let d = 1;
      satir: while (j + d < derinlik) {
        for (let k = 0; k < w; k++) if (!ayni((j + d) * genislik + i + k)) break satir;
        d++;
      }
      for (let jj = j; jj < j + d; jj++) kullanildi.fill(1, jj * genislik + i, jj * genislik + i + w);

      const x0 = i, x1 = i + w, z0 = j, z1 = j + d;
      g.dortgen([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], CATI_DOKUSU[m]);
    }
  }

  // Yan yüzler: komşu daha alçaksa, aradaki fark kadar duvar. Bir sıra boyunca aynı
  // yükseklik/komşu yüksekliği/malzemedeki ardışık hücreler tek dörtgen olur.
  // Doğu (+x) ve batı (-x) yüzleri: her sütun sınırı boyunca z yönünde birleştirilir
  for (const yon of [1, -1]) {
    for (let i = 0; i < genislik; i++) {
      const x = yon > 0 ? i + 1 : i;
      let j = 0;
      while (j < derinlik) {
        const h = j * genislik + i;
        const y1 = yukseklik[h];
        const y0 = H(i + yon, j);
        if (y1 <= y0) { j++; continue; }
        const m = malzeme[h];
        let d = 1;
        while (j + d < derinlik) {
          const h2 = (j + d) * genislik + i;
          if (yukseklik[h2] !== y1 || malzeme[h2] !== m || H(i + yon, j + d) !== y0) break;
          d++;
        }
        const z0 = j, z1 = j + d;
        if (yon > 0) g.dortgen([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], [1, 0, 0], DUVAR_DOKUSU[m]);
        else g.dortgen([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], [-1, 0, 0], DUVAR_DOKUSU[m]);
        j += d;
      }
    }
  }
  // Güney (+z) ve kuzey (-z) yüzleri: her satır sınırı boyunca x yönünde birleştirilir
  for (const yon of [1, -1]) {
    for (let j = 0; j < derinlik; j++) {
      const z = yon > 0 ? j + 1 : j;
      let i = 0;
      while (i < genislik) {
        const h = j * genislik + i;
        const y1 = yukseklik[h];
        const y0 = H(i, j + yon);
        if (y1 <= y0) { i++; continue; }
        const m = malzeme[h];
        let w = 1;
        while (i + w < genislik) {
          const h2 = h + w;
          if (yukseklik[h2] !== y1 || malzeme[h2] !== m || H(i + w, j + yon) !== y0) break;
          w++;
        }
        const x0 = i, x1 = i + w;
        if (yon > 0) g.dortgen([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], DUVAR_DOKUSU[m]);
        else g.dortgen([[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]], [0, 0, -1], DUVAR_DOKUSU[m]);
        i += w;
      }
    }
  }

  return { geometri: g.bitir(), dortgenSayisi: g.dortgenSayisi() };
}

// ---- Malzeme (shader) ----

const koseShader = /* glsl */ `
  in float katman;
  out vec3 vDunya;
  out vec3 vNormal;
  out float vKatman;
  out float vDerinlik;

  void main() {
    vec4 dunya = modelMatrix * vec4(position, 1.0);
    vec4 gorus = viewMatrix * dunya;
    vDunya = dunya.xyz;
    vNormal = normal;
    vKatman = katman;
    vDerinlik = -gorus.z;
    gl_Position = projectionMatrix * gorus;
  }
`;

const parcaShader = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;

  uniform sampler2DArray dokular;
  uniform vec3 sisRengi;
  uniform float sisYakin;
  uniform float sisUzak;

  in vec3 vDunya;
  in vec3 vNormal;
  in float vKatman;
  in float vDerinlik;
  out vec4 renk;

  void main() {
    vec3 n = normalize(vNormal);
    vec2 uv;
    float isik;
    if (n.y > 0.5) {
      uv = vDunya.xz;
      isik = 1.0;
    } else {
      // Duvar: her blok bir kat; doku satır 0'ı bloğun üstüne gelsin diye y ters çevrilir
      uv = vec2(abs(n.x) > 0.5 ? vDunya.z : vDunya.x, -vDunya.y);
      isik = abs(n.x) > 0.5 ? 0.82 : 0.68;
      // Zemine yakın kısım biraz daha koyu: bloklar yere oturuyormuş gibi görünür
      isik *= 0.86 + 0.14 * clamp(vDunya.y / 1.5, 0.0, 1.0);
    }
    vec3 c = texture(dokular, vec3(uv, vKatman)).rgb * isik;
    c = mix(c, sisRengi, smoothstep(sisYakin, sisUzak, vDerinlik));
    renk = vec4(c, 1.0);
  }
`;

export function binalariOlustur(izgara, dokular, gokRengi) {
  const { geometri, dortgenSayisi } = binaGeometrisi(izgara);
  const malzeme = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: koseShader,
    fragmentShader: parcaShader,
    uniforms: {
      dokular: { value: dokular },
      sisRengi: { value: new THREE.Color(gokRengi).convertLinearToSRGB() },
      sisYakin: { value: 350 },
      sisUzak: { value: 1100 }
    }
  });
  const mesh = new THREE.Mesh(geometri, malzeme);
  mesh.userData.dortgenSayisi = dortgenSayisi;
  return mesh;
}
