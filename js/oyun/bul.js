// Bulma (PLAN 3.3): yakındaki hediyelerin listesi ve ipucu, QR okutup hediyeyi alma, ödül ekranı.
// Haritadaki sürümü (kutular, sıcak-soğuk) D akışında js/oyun/haritada.js yapar; bu ekranlar
// haritasız deneme sayfası (oyun.html) için ve haritadan da açılabilsin diye.
import { el, islem, SEVIYE_ADI } from './ortak.js';
import { qrOkuyucu } from './qr.js';
import { KURALLAR } from './arayuz.js';

// İki konum arası yaklaşık metre
function mesafe(e1, b1, e2, b2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((e2 - e1) * r / 2) ** 2 + Math.cos(e1 * r) * Math.cos(e2 * r) * Math.sin((b2 - b1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Yakındaki açık hediyeler; her birinde ipucu düğmesi (30 m içinde açılır)
 * @param {HTMLElement} kap
 * @param {{ istemci: import('./arayuz.js').OyunIstemcisi, konumAl: () => Promise<{enlem: number, boylam: number}> }} s
 */
export async function yakindakilerEkrani(kap, { istemci, konumAl }) {
  kap.replaceChildren(el('p.oyun-ipucu', {}, 'Yakındaki hediyeler aranıyor…'));
  const sonuc = await islem(null, async () => {
    const konum = await konumAl();
    return { konum, liste: await istemci.yakinHediyeler(konum.enlem, konum.boylam) };
  });
  if (!sonuc) {
    kap.replaceChildren(el('p.oyun-hata', {}, 'Hediyeler alınamadı.'));
    return;
  }
  const { konum, liste } = sonuc;
  const saat = new Date().getHours();
  const bos = saat >= 22 || saat < 7
    ? 'Hediyeler sabah 07:00\'de görünecek.'
    : 'Şu an görebildiğin hediye yok. Hediye saklayarak daha fazlasını açabilirsin.';

  kap.replaceChildren(el('div.oyun-kutu', {},
    el('h2', {}, 'Yakındaki hediyeler'),
    el('p.oyun-ipucu', {}, `Gösterilen yerler gerçek yerden ${KURALLAR.KAYDIRMA_EN_FAZLA_M} m'ye kadar kayıktır; ipucu ${KURALLAR.IPUCU_MESAFESI_M} m içinde açılır.`),
    liste.length
      ? el('div.oyun-liste', {}, liste.map((h) => {
        const d = Math.round(mesafe(konum.enlem, konum.boylam, h.gosterimEnlem, h.gosterimBoylam));
        const ipucuKabi = el('div');
        const dugme = el('button.ikincil', {
          type: 'button',
          onclick: () => islem(dugme, async () => {
            const k = await konumAl();
            const ipucu = await istemci.ipucuGetir(h.id, k.enlem, k.boylam);
            ipucuKabi.replaceChildren(
              el('p.oyun-not', {}, ipucu.metin),
              ipucu.fotoUrl ? el('img.oyun-foto', { src: ipucu.fotoUrl, alt: 'İpucu fotoğrafı' }) : null);
          })
        }, 'İpucunu göster');
        return el('article.oyun-kart', { veri: { seviye: h.seviye } },
          el('header', {}, el('strong', {}, SEVIYE_ADI[h.seviye]), el('small', {}, `yaklaşık ${d} m`)),
          dugme, ipucuKabi);
      }))
      : el('p.oyun-ipucu', {}, bos)));
}

/**
 * Kartı okut → hediyeyi al → ödül ekranı
 * @param {HTMLElement} kap
 * @param {Object} s
 * @param {import('./arayuz.js').OyunIstemcisi} s.istemci
 * @param {() => Promise<{enlem: number, boylam: number}>} s.konumAl
 * @param {() => void} [s.cuzdanaGit]
 */
export function okutEkrani(kap, { istemci, konumAl, cuzdanaGit }) {
  const okuyucuKabi = el('div');
  const okuyucu = qrOkuyucu(okuyucuKabi, { tur: 'hediye', baslik: 'Hediye kartını okut' });
  kap.replaceChildren(okuyucuKabi);

  (async () => {
    const qrKodu = await okuyucu.sonuc;
    if (!qrKodu) return;
    const kayit = await islem(null, async () => {
      const konum = await konumAl();
      return istemci.hediyeAl(qrKodu, konum.enlem, konum.boylam);
    });
    if (!kayit) {
      // Hata bildirimi gösterildi; tekrar denemek için okuyucu yeniden açılır
      kap.append(el('button.ikincil', { type: 'button', onclick: () => okutEkrani(kap, { istemci, konumAl, cuzdanaGit }) }, 'Tekrar dene'));
      return;
    }
    odulEkrani(kap, kayit, cuzdanaGit);
  })();

  return { durdur: okuyucu.durdur };
}

function odulEkrani(kap, kayit, cuzdanaGit) {
  const konfeti = el('div.oyun-konfeti', { 'aria-hidden': 'true' });
  const renkler = ['#e53935', '#43a047', '#fdd835', '#1e88e5', '#ffffff'];
  for (let k = 0; k < 40; k++) {
    konfeti.append(el('i', {
      style: `left:${Math.random() * 100}%;background:${renkler[k % renkler.length]};` +
        `animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(1.6 + Math.random()).toFixed(2)}s`
    }));
  }
  let ozet;
  if (kayit.seviye === 'kar') ozet = el('p.oyun-not', {}, kayit.notMetni || '');
  else if (kayit.seviye === 'gumus') ozet = el('p', {}, `${kayit.urun} · ${kayit.kafeAdi}. Kodun cüzdanında.`);
  else ozet = el('p', {}, `${kayit.cekMarkasi} hediye çeki. Kodun cüzdanında.`);

  kap.replaceChildren(konfeti, el('div.oyun-odul', {},
    el('h2', {}, 'Hediyeyi buldun! 🎉'),
    el('p', {}, SEVIYE_ADI[kayit.seviye], ' · ', kayit.saklayanTakmaAd, ' saklamıştı'),
    ozet,
    el('p.oyun-ipucu', {}, 'Kartı yanına alabilirsin; hediye haritadan kalktı.'),
    cuzdanaGit ? el('button.birincil', { type: 'button', onclick: cuzdanaGit }, 'Cüzdanıma git') : null));
}
