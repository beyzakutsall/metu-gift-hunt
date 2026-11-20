// Saklama akışı (PLAN 3.2): seviye → hediye bilgisi → ipucu → saklama QR'ı (tek seferlik gösterim)
import { el, islem, bildirimGoster, SEVIYE_ADI } from './ortak.js';
import { qrCiz, qrOkuyucu } from './qr.js';

const SEVIYE_ACIKLAMASI = {
  kar: 'Bir not ya da dilek. Haritada +1 hediye açar.',
  gumus: 'Kafede askıda kahve/tatlı. Kafenin kupon QR\'ını okutursun. +3 hediye açar.',
  altin: 'Hediye çeki kodu. Bulan kişi "kod çalıştı" deyince +10 hediye açar.'
};

// Fotoğrafı en uzun kenarı 800 piksel olan bir JPEG'e küçültür (yükleme ve depolama küçük kalsın)
async function fotoKucult(dosya, enUzun = 800) {
  const bitmap = await createImageBitmap(dosya);
  const olcek = Math.min(1, enUzun / Math.max(bitmap.width, bitmap.height));
  const tuval = document.createElement('canvas');
  tuval.width = Math.round(bitmap.width * olcek);
  tuval.height = Math.round(bitmap.height * olcek);
  tuval.getContext('2d').drawImage(bitmap, 0, 0, tuval.width, tuval.height);
  bitmap.close?.();
  return new Promise((r) => tuval.toBlob(r, 'image/jpeg', 0.8));
}

/**
 * @param {HTMLElement} kap
 * @param {Object} s
 * @param {import('./arayuz.js').OyunIstemcisi} s.istemci
 * @param {() => Promise<{enlem: number, boylam: number}>} s.konumAl
 * @param {() => void} [s.bitince]  Saklama bitip QR kapatılınca
 */
export function saklamaEkrani(kap, { istemci, konumAl, bitince }) {
  let kuponQr = null;
  let okuyucu = null;

  const seviyeler = el('fieldset.oyun-seviyeler', {},
    el('legend', {}, 'Hediyenin seviyesi'),
    ...['kar', 'gumus', 'altin'].map((s) => el('label.oyun-secenek', {},
      el('input', { type: 'radio', name: 'seviye', value: s, checked: s === 'kar', onchange: guncelle }),
      el('span', {}, el('strong', {}, SEVIYE_ADI[s]), el('small', {}, SEVIYE_ACIKLAMASI[s])))));

  const notMetni = el('textarea', { name: 'not', rows: 4, maxLength: 1000, placeholder: 'Bulan kişiye notun…' });
  const karAlani = el('label.oyun-alan', {}, 'Not', notMetni);

  const kuponDurumu = el('p.oyun-ipucu', {}, 'Henüz kupon okutulmadı.');
  const okuyucuKabi = el('div');
  const gumusAlani = el('div.oyun-alan', {},
    el('span', {}, 'Kafe kuponu'),
    kuponDurumu,
    el('button.ikincil', { type: 'button', onclick: kuponOkut }, 'Kupon QR\'ını okut'),
    okuyucuKabi);

  const cekMarkasi = el('input', { type: 'text', maxLength: 60, placeholder: 'Ör. Kitapçı' });
  const cekKodu = el('input', { type: 'text', maxLength: 200, autocomplete: 'off', placeholder: 'Çekin kodu' });
  const altinAlani = el('div', {},
    el('label.oyun-alan', {}, 'Çekin markası', cekMarkasi),
    el('label.oyun-alan', {}, 'Çek kodu (yalnızca bulana gösterilir)', cekKodu));

  const ipucuMetni = el('textarea', { rows: 2, maxLength: 280, required: true, placeholder: 'Ör. Kütüphane girişinin solundaki bankın altı' });
  const ipucuFoto = el('input', { type: 'file', accept: 'image/*', capture: 'environment' });

  const gonder = el('button.birincil', { type: 'submit' }, 'Sakla ve QR\'ı oluştur');

  const form = el('form.oyun-form', { onsubmit: sakla },
    el('h2', {}, 'Hediye sakla'),
    seviyeler,
    karAlani, gumusAlani, altinAlani,
    el('label.oyun-alan', {}, 'İpucu (zorunlu)', ipucuMetni),
    el('label.oyun-alan', {}, 'İpucu fotoğrafı (isteğe bağlı)', ipucuFoto),
    gonder);

  function seviye() {
    return form.querySelector('input[name=seviye]:checked').value;
  }

  function guncelle() {
    const s = seviye();
    karAlani.hidden = s !== 'kar';
    gumusAlani.hidden = s !== 'gumus';
    altinAlani.hidden = s !== 'altin';
  }

  async function kuponOkut() {
    okuyucu?.durdur();
    okuyucu = qrOkuyucu(okuyucuKabi, { tur: 'kupon', baslik: 'Kafenin gösterdiği kupon QR\'ı' });
    const metin = await okuyucu.sonuc;
    okuyucu = null;
    okuyucuKabi.replaceChildren();
    if (metin) {
      kuponQr = metin;
      kuponDurumu.textContent = 'Kupon okundu ✓';
    }
  }

  async function sakla(e) {
    e.preventDefault();
    const s = seviye();
    if (s === 'gumus' && !kuponQr) {
      bildirimGoster('Önce kafenin kupon QR\'ını okut.', 'hata');
      return;
    }
    await islem(gonder, async () => {
      const konum = await konumAl();
      const girdi = { seviye: s, enlem: konum.enlem, boylam: konum.boylam, ipucuMetni: ipucuMetni.value };
      if (ipucuFoto.files[0]) girdi.ipucuFoto = await fotoKucult(ipucuFoto.files[0]);
      if (s === 'kar') girdi.notMetni = notMetni.value;
      if (s === 'gumus') girdi.kuponQr = kuponQr;
      if (s === 'altin') Object.assign(girdi, { cekMarkasi: cekMarkasi.value, cekKodu: cekKodu.value });
      const { qrKodu } = await istemci.hediyeSakla(girdi);
      okuyucu?.durdur();
      await qrGoster(qrKodu, s);
    });
  }

  // QR yalnızca burada, bir kez gösterilir; kod sunucuda tutulmaz
  async function qrGoster(qrKodu, s) {
    const tamam = el('button.birincil', { type: 'button', disabled: true, onclick: () => bitince?.() }, 'Kartı sakladım');
    const onay = el('input', { type: 'checkbox', onchange: () => { tamam.disabled = !onay.checked; } });
    kap.replaceChildren(el('div.oyun-form', {},
      el('h2', {}, 'Saklama QR\'ın hazır'),
      el('p.oyun-uyari', {}, 'Bu QR yalnızca şimdi gösteriliyor. Yazdır ya da başka bir telefondan okut; sayfayı kapatınca bir daha göremezsin.'),
      el('div.oyun-qr-kart', {},
        await qrCiz(qrKodu, 260),
        el('p.oyun-qr-baslik', {}, 'ODTÜ Hediye Avı · ', SEVIYE_ADI[s]),
        el('p.oyun-qr-not', {}, 'Bu kartı yalnızca Hediye Avı uygulamasının içinden okut.'),
        el('code.oyun-kod', {}, qrKodu)),
      el('div.oyun-satir', {},
        el('button.ikincil', { type: 'button', onclick: () => window.print() }, 'Yazdır')),
      el('label.oyun-secenek', {}, onay, el('span', {}, 'QR\'ı yazdırdım ya da kaydettim')),
      tamam));
  }

  kap.replaceChildren(form);
  guncelle();
  return { durdur: () => okuyucu?.durdur() };
}
