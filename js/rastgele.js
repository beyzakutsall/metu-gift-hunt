// Tohumlu rastgele sayı üreteci (mulberry32): aynı tohum her açılışta aynı dünyayı verir
export function rastgeleUretici(tohum) {
  let durum = tohum >>> 0;
  return function () {
    durum = (durum + 0x6D2B79F5) >>> 0;
    let t = durum;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
