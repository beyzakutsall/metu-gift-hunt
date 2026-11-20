// Doluluk ızgarası: haritadaki her hücrede ne durduğunu tutar ki tabelalar, simge nesneler ve
// ağaçlar birbirine, binalara ve yollara girmesin. Yerleşim sırası: binalar → tabelalar →
// nesneler → ağaçlar; her adım öncekilerin işaretlediği hücrelerden kaçınır.
import { ZEMIN } from './dunya.js';

export const DOLU = { BOS: 0, BINA: 1, YOL: 2, TABELA: 3, NESNE: 4 };

// Yol sayılan zeminler: üstüne tabela ya da ağaç konmaz
const YOL_ZEMINLERI = new Set([ZEMIN.TAS, ZEMIN.ASFALT, ZEMIN.OTOPARK, ZEMIN.PIST, ZEMIN.SU, ZEMIN.SAHA]);

export function dolulukOlustur(zeminIzgarasi, binaIzgarasi) {
  const { genislik, derinlik, zemin } = zeminIzgarasi;
  const dolu = new Uint8Array(genislik * derinlik);
  for (let h = 0; h < dolu.length; h++) {
    if (binaIzgarasi.yukseklik[h]) dolu[h] = DOLU.BINA;
    else if (YOL_ZEMINLERI.has(zemin[h])) dolu[h] = DOLU.YOL;
  }

  const icinde = (i, j) => i >= 0 && j >= 0 && i < genislik && j < derinlik;
  return {
    genislik, derinlik, dolu,
    // (i, j) etrafında r hücrelik karede kosul(deger) sağlanan hücre var mı (dışarısı sayılmaz)
    varMi(i, j, r, kosul) {
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
        if (icinde(i + a, j + b) && kosul(dolu[(j + b) * genislik + i + a])) return true;
      }
      return false;
    },
    isaretle(i, j, deger) {
      if (icinde(i, j)) dolu[j * genislik + i] = deger;
    }
  };
}
