// Enlem/boylam ile blok koordinatları arasında dönüşüm.
// Dünya birimi 1 bloktur (≈3 m). (0, 0) kampüs sınırının kuzeybatı köşesidir;
// x doğuya, z güneye doğru artar, y yukarıdır.

export const SINIR = { bati: 32.760, guney: 39.880, dogu: 32.800, kuzey: 39.903 };
export const BLOK_METRE = 3;

// Bu küçük alanda düz (eşdikdörtgen) projeksiyon yeterli; ölçekler merkez enleme göre
const merkezEnlem = ((SINIR.guney + SINIR.kuzey) / 2) * Math.PI / 180;
const METRE_ENLEM = 111132.92 - 559.82 * Math.cos(2 * merkezEnlem) + 1.175 * Math.cos(4 * merkezEnlem);
const METRE_BOYLAM = 111412.84 * Math.cos(merkezEnlem) - 93.5 * Math.cos(3 * merkezEnlem);

// Izgaranın blok cinsinden boyutu (yaklaşık 1140 x 850)
export const IZGARA = {
  genislik: Math.ceil((SINIR.dogu - SINIR.bati) * METRE_BOYLAM / BLOK_METRE),
  derinlik: Math.ceil((SINIR.kuzey - SINIR.guney) * METRE_ENLEM / BLOK_METRE)
};

export function enlemBoylamdanBloga(enlem, boylam) {
  return {
    x: (boylam - SINIR.bati) * METRE_BOYLAM / BLOK_METRE,
    z: (SINIR.kuzey - enlem) * METRE_ENLEM / BLOK_METRE
  };
}

export function bloktanEnlemBoylama(x, z) {
  return {
    enlem: SINIR.kuzey - z * BLOK_METRE / METRE_ENLEM,
    boylam: SINIR.bati + x * BLOK_METRE / METRE_BOYLAM
  };
}
