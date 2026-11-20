// Cüzdanım (PLAN 3.3): bulduğum hediyeler (not, kafe kuponu, çek kodu) ve sakladıklarım
import { el, islem, bildirimGoster, SEVIYE_ADI, zamanMetni } from './ortak.js';

const SAKLANAN_DURUMU = { saklandi: 'Bekliyor', bulundu: 'Bulundu', gizlendi: 'Gizlendi (bildirim)' };
const KUPON_DURUMU = { bulundu: 'Kafede kullanılabilir', kullanildi: 'Kullanıldı' };

/**
 * @param {HTMLElement} kap
 * @param {{ istemci: import('./arayuz.js').OyunIstemcisi }} s
 */
export async function cuzdanEkrani(kap, { istemci }) {
  kap.replaceChildren(el('p.oyun-ipucu', {}, 'Cüzdan yükleniyor…'));
  const veri = await islem(null, () => istemci.cuzdan());
  if (!veri) {
    kap.replaceChildren(el('p.oyun-hata', {}, 'Cüzdan yüklenemedi.'));
    return;
  }
  const yenile = () => cuzdanEkrani(kap, { istemci });

  function bulunanKart(k) {
    const kart = el('article.oyun-kart', { veri: { seviye: k.seviye } },
      el('header', {}, el('strong', {}, SEVIYE_ADI[k.seviye]), el('small', {}, `${k.saklayanTakmaAd} · ${zamanMetni(k.bulunmaZamani)}`)));

    if (k.seviye === 'kar') {
      const kalp = el('button.ikincil', {
        type: 'button', disabled: k.kalpSayisi > 0,
        onclick: () => islem(kalp, async () => { await istemci.kalpVer(k.hediyeId); yenile(); })
      }, k.kalpSayisi > 0 ? '❤️ Kalp verdin' : '🤍 Kalp ver');
      const bildir = el('button.ikincil', {
        type: 'button',
        onclick: () => islem(bildir, async () => {
          await istemci.bildir(k.hediyeId);
          bildir.disabled = true;
          bildirimGoster('Bildirimin alındı, teşekkürler.');
        })
      }, 'Uygunsuz içerik bildir');
      kart.append(el('p.oyun-not', {}, k.notMetni || ''), el('div.oyun-satir', {}, kalp, bildir));
    } else if (k.seviye === 'gumus') {
      kart.append(
        el('p', {}, `${k.urun || 'Ürün'} · ${k.kafeAdi || 'Kafe'}`),
        k.kuponDurumu === 'kullanildi'
          ? el('p.oyun-ipucu', {}, KUPON_DURUMU.kullanildi)
          : el('div', {},
            el('p.oyun-ipucu', {}, 'Kasada bu kodu göster:'),
            el('p.oyun-kullanim-kodu', {}, k.kullanimKodu || '')));
    } else {
      kart.append(el('p', {}, k.cekMarkasi || ''), el('code.oyun-kod', {}, k.cekKodu || ''));
      if (k.cekSonucu === null || k.cekSonucu === undefined) {
        const sonuc = (calisti) => (e) => islem(e.currentTarget, async () => {
          await istemci.cekSonucu(k.hediyeId, calisti);
          yenile();
        });
        kart.append(el('p.oyun-ipucu', {}, 'Kod çalıştı mı?'), el('div.oyun-satir', {},
          el('button.ikincil', { type: 'button', onclick: sonuc(true) }, 'Çalıştı'),
          el('button.ikincil', { type: 'button', onclick: sonuc(false) }, 'Çalışmadı')));
      } else {
        kart.append(el('p.oyun-ipucu', {}, k.cekSonucu ? 'Kodun çalıştığını bildirdin.' : 'Kodun çalışmadığını bildirdin.'));
      }
    }
    return kart;
  }

  function saklananSatir(s) {
    return el('li', {},
      el('span', {}, SEVIYE_ADI[s.seviye], ' · ', zamanMetni(s.saklanmaZamani)),
      el('small', {}, SAKLANAN_DURUMU[s.durum] || s.durum, s.bulanTakmaAd ? ` · ${s.bulanTakmaAd}` : ''));
  }

  kap.replaceChildren(el('div.oyun-kutu', {},
    el('h2', {}, 'Cüzdanım'),
    el('h3', {}, 'Bulduklarım'),
    veri.bulduklarim.length
      ? el('div.oyun-liste', {}, veri.bulduklarim.map(bulunanKart))
      : el('p.oyun-ipucu', {}, 'Henüz hediye bulmadın.'),
    el('h3', {}, 'Sakladıklarım'),
    veri.sakladiklarim.length
      ? el('ul.oyun-saklananlar', {}, veri.sakladiklarim.map(saklananSatir))
      : el('p.oyun-ipucu', {}, 'Henüz hediye saklamadın.')));
}
