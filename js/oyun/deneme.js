// oyun.html: haritasız deneme sayfası. Konum elle girilir (GPS'ten de alınabilir), oyun ekranları
// sekmelerde açılır. D akışı aynı ekranları harita sayfasına bağlayacak.
import { el, islem, bildirimGoster, istemciSec } from './ortak.js';
import { saklamaEkrani } from './sakla.js';
import { cuzdanEkrani } from './cuzdan.js';
import { yakindakilerEkrani, okutEkrani } from './bul.js';

const KONUMLAR = [
  { ad: 'Kütüphane önü', enlem: 39.8915, boylam: 32.7835 },
  { ad: 'Kütüphane, 40 m doğu', enlem: 39.8915, boylam: 32.78397 },
  { ad: 'Kütüphane, 100 m doğu', enlem: 39.8915, boylam: 32.78467 },
  { ad: 'Kampüs dışı (yasak)', enlem: 39.9100, boylam: 32.7835 }
];

const kok = document.getElementById('oyun');
const { istemci, sahte } = await istemciSec();
let oyuncu = await istemci.oturumAc();
let aktifEkran = null;

// ---------------- Konum ----------------
const enlemGirdisi = el('input', { type: 'number', step: 'any', value: KONUMLAR[0].enlem, 'aria-label': 'Enlem' });
const boylamGirdisi = el('input', { type: 'number', step: 'any', value: KONUMLAR[0].boylam, 'aria-label': 'Boylam' });
const hazirKonum = el('select', {
  'aria-label': 'Hazır konumlar',
  onchange: () => {
    const k = KONUMLAR[hazirKonum.value];
    if (!k) return;
    enlemGirdisi.value = k.enlem;
    boylamGirdisi.value = k.boylam;
  }
}, el('option', { value: '' }, 'Hazır konum seç…'), KONUMLAR.map((k, i) => el('option', { value: i }, k.ad)));

const gpsDugmesi = el('button.ikincil', {
  type: 'button',
  onclick: () => islem(gpsDugmesi, async () => {
    const p = await new Promise((tamam, hata) => navigator.geolocation.getCurrentPosition(tamam, hata, { enableHighAccuracy: true, timeout: 15000 }));
    enlemGirdisi.value = p.coords.latitude.toFixed(6);
    boylamGirdisi.value = p.coords.longitude.toFixed(6);
    bildirimGoster(`Konum alındı (±${Math.round(p.coords.accuracy)} m)`);
  })
}, 'GPS\'ten al');

async function konumAl() {
  const enlem = parseFloat(enlemGirdisi.value), boylam = parseFloat(boylamGirdisi.value);
  if (!Number.isFinite(enlem) || !Number.isFinite(boylam)) throw Object.assign(new Error('Konum geçersiz'), { kod: 'GECERSIZ', message: 'Enlem ve boylamı gir.' });
  return { enlem, boylam };
}

// ---------------- Ekranlar ----------------
const icerik = el('section', { 'aria-live': 'polite' });
const sekmeler = {
  sakla: 'Sakla',
  okut: 'Kart okut',
  yakin: 'Yakındakiler',
  cuzdan: 'Cüzdanım'
};
const sekmeDugmeleri = el('nav.oyun-sekmeler', { role: 'tablist' },
  Object.entries(sekmeler).map(([ad, baslik]) => el('button', { type: 'button', role: 'tab', veri: { sekme: ad }, onclick: () => ac(ad) }, baslik)));

function ac(ad) {
  aktifEkran?.durdur?.();
  aktifEkran = null;
  for (const d of sekmeDugmeleri.children) d.setAttribute('aria-selected', String(d.dataset.sekme === ad));
  if (ad === 'sakla') aktifEkran = saklamaEkrani(icerik, { istemci, konumAl, bitince: () => { oyuncuyuYenile(); ac('cuzdan'); } });
  else if (ad === 'okut') aktifEkran = okutEkrani(icerik, { istemci, konumAl, cuzdanaGit: () => ac('cuzdan') });
  else if (ad === 'yakin') yakindakilerEkrani(icerik, { istemci, konumAl });
  else cuzdanEkrani(icerik, { istemci });
}

// ---------------- Oyuncu ----------------
const oyuncuBilgisi = el('p.oyun-ipucu');

async function oyuncuyuYenile() {
  oyuncu = await istemci.oturumAc();
  oyuncuBilgisi.textContent = oyuncu
    ? `${oyuncu.takmaAd} · ${3 + oyuncu.acilim} hediye görebilirsin`
    : 'Henüz katılmadın.';
}

function katilmaFormu() {
  const ad = el('input', { type: 'text', maxLength: 24, required: true, placeholder: 'Takma ad' });
  const dugme = el('button.birincil', { type: 'submit' }, 'Oyuna katıl');
  return el('form.oyun-form', {
    onsubmit: (e) => {
      e.preventDefault();
      islem(dugme, async () => {
        oyuncu = await istemci.oyuncuOlustur(ad.value);
        oyunuGoster();
      });
    }
  }, el('h2', {}, 'Hediye Avı\'na hoş geldin'), el('label.oyun-alan', {}, 'Takma adın', ad), dugme);
}

function sahteAraclari() {
  if (!sahte) return null;
  return el('div.oyun-satir', {},
    el('button.ikincil', {
      type: 'button',
      onclick: () => { istemci.sahte.oyuncuDegistir(); oyuncu = null; oyunuGoster(); }
    }, 'Başka oyuncu ol'),
    el('button.ikincil', {
      type: 'button',
      onclick: () => { istemci.sahte.sifirla(); oyuncu = null; oyunuGoster(); bildirimGoster('Sahte veri sıfırlandı.'); }
    }, 'Sahte veriyi sıfırla'));
}

async function oyunuGoster() {
  aktifEkran?.durdur?.();
  aktifEkran = null;
  await oyuncuyuYenile();
  const ust = el('header.oyun-kutu', {},
    el('p', {}, el('strong', {}, 'ODTÜ Hediye Avı'), ' · ', sahte ? 'sahte istemci (sunucusuz)' : 'Supabase'),
    oyuncuBilgisi,
    el('div.oyun-satir', {}, enlemGirdisi, boylamGirdisi),
    el('div.oyun-satir', {}, hazirKonum, gpsDugmesi),
    sahteAraclari());
  if (!oyuncu) {
    kok.replaceChildren(ust, katilmaFormu());
    return;
  }
  kok.replaceChildren(ust, sekmeDugmeleri, icerik);
  ac('sakla');
}

oyunuGoster();
