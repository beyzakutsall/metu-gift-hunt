// Zemin: tüm kampüs tek bir 1 blok kalınlığında kutu ve tek bir çizim çağrısıdır.
// Hücre türleri küçük bir "tür haritası" dokusunda (her piksel = 1 blok) durur; shader
// her parça için hücrenin türünü okuyup ilgili 16x16 dokuyu o hücreye döşer.
import * as THREE from 'three';
import { ZEMIN } from './dunya.js';
import { KATMAN_CIM_YAN } from './dokular.js';

const koseShader = /* glsl */ `
  out vec3 vDunya;
  out vec3 vNormal;
  out float vDerinlik;

  void main() {
    vec4 dunya = modelMatrix * vec4(position, 1.0);
    vec4 gorus = viewMatrix * dunya;
    vDunya = dunya.xyz;
    vNormal = normal;
    vDerinlik = -gorus.z;
    gl_Position = projectionMatrix * gorus;
  }
`;

const parcaShader = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;

  uniform sampler2D tipHaritasi;
  uniform sampler2DArray dokular;
  uniform vec3 sisRengi;
  uniform float sisYakin;
  uniform float sisUzak;

  in vec3 vDunya;
  in vec3 vNormal;
  in float vDerinlik;
  out vec4 renk;

  float karistir(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 n = normalize(vNormal);
    float katman;
    vec2 uv;
    float isik;

    if (n.y > 0.5) {
      // Üst yüz: hücrenin türü tür haritasından okunur
      ivec2 boyut = textureSize(tipHaritasi, 0);
      ivec2 hucre = clamp(ivec2(floor(vDunya.xz)), ivec2(0), boyut - 1);
      katman = floor(texelFetch(tipHaritasi, hucre, 0).r * 255.0 + 0.5);
      uv = vDunya.xz;
      // Her bloğa hafif parlaklık farkı: ızgara hissi verir
      isik = 0.93 + 0.07 * karistir(vec2(hucre));
    } else if (n.y < -0.5) {
      katman = float(KATMAN_TOPRAK);
      uv = vDunya.xz;
      isik = 0.5;
    } else {
      // Kenar yüzleri: üstü çimli toprak; doğu/batı ve kuzey/güney farklı gölgede
      katman = float(KATMAN_CIM_YAN);
      uv = vec2(abs(n.x) > 0.5 ? vDunya.z : vDunya.x, -vDunya.y);
      isik = abs(n.x) > 0.5 ? 0.8 : 0.65;
    }

    // uv sürekli olduğu için mip seviyeleri blok sınırlarında atlamaz; döşeme RepeatWrapping ile
    vec3 c = texture(dokular, vec3(uv, katman)).rgb * isik;
    c = mix(c, sisRengi, smoothstep(sisYakin, sisUzak, vDerinlik));
    renk = vec4(c, 1.0);
  }
`;

export function zeminOlustur(izgara, dokular, gokRengi) {
  const { genislik, derinlik, zemin } = izgara;

  const tipHaritasi = new THREE.DataTexture(zemin, genislik, derinlik, THREE.RedFormat, THREE.UnsignedByteType);
  tipHaritasi.magFilter = THREE.NearestFilter;
  tipHaritasi.minFilter = THREE.NearestFilter;
  tipHaritasi.generateMipmaps = false;
  tipHaritasi.unpackAlignment = 1; // genişlik 4'ün katı değil
  tipHaritasi.needsUpdate = true;

  const malzeme = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: koseShader,
    fragmentShader: parcaShader,
    defines: {
      KATMAN_TOPRAK: ZEMIN.TOPRAK,
      KATMAN_CIM_YAN: KATMAN_CIM_YAN
    },
    uniforms: {
      tipHaritasi: { value: tipHaritasi },
      dokular: { value: dokular },
      // Shader renk dönüşümü yapmadığı için sis rengi sRGB olarak verilir
      sisRengi: { value: new THREE.Color(gokRengi).convertLinearToSRGB() },
      sisYakin: { value: 350 },
      sisUzak: { value: 1100 }
    }
  });

  // Üst yüzü y = 0'da, kuzeybatı köşesi (0, 0)'da olan kutu
  const geometri = new THREE.BoxGeometry(genislik, 1, derinlik);
  geometri.translate(genislik / 2, -0.5, derinlik / 2);

  return new THREE.Mesh(geometri, malzeme);
}
