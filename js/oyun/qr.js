// QR üretme ve okuma. Yalnızca oyunun kendi biçimleri (MGH1: hediye, MGK1: kupon) kabul edilir;
// URL içeren ya da başka QR'lar yok sayılır, böylece sahte QR ile oltalama işe yaramaz.
// Kütüphaneler sabit sürümle CDN'den, ilk kullanımda yüklenir.
import { qrAyristir } from './arayuz.js';
import { el } from './ortak.js';

const QRCODE_ADRESI = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
const JSQR_ADRESI = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';

// Metni QR olarak bir tuvale çizer
export async function qrCiz(metin, boyut = 240) {
  const { default: QRCode } = await import(QRCODE_ADRESI);
  const tuval = document.createElement('canvas');
  await QRCode.toCanvas(tuval, metin, { width: boyut, margin: 2, errorCorrectionLevel: 'M' });
  tuval.className = 'oyun-qr';
  return tuval;
}

// BarcodeDetector QR destekliyorsa onu, yoksa jsQR'ı kullanan bir çözücü döndürür
async function cozucuOlustur() {
  if ('BarcodeDetector' in globalThis) {
    try {
      const bicimler = await globalThis.BarcodeDetector.getSupportedFormats();
      if (bicimler.includes('qr_code')) {
        const algilayici = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => (await algilayici.detect(video)).map((s) => s.rawValue);
      }
    } catch { /* jsQR'a düş */ }
  }
  const { default: jsQR } = await import(JSQR_ADRESI);
  const tuval = document.createElement('canvas');
  const baglam = tuval.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return [];
    // Büyük görüntülerde jsQR yavaş; kısa kenar en fazla 480 piksel
    const olcek = Math.min(1, 480 / Math.min(w, h));
    tuval.width = Math.round(w * olcek);
    tuval.height = Math.round(h * olcek);
    baglam.drawImage(video, 0, 0, tuval.width, tuval.height);
    const goruntu = baglam.getImageData(0, 0, tuval.width, tuval.height);
    const sonuc = jsQR(goruntu.data, goruntu.width, goruntu.height, { inversionAttempts: 'dontInvert' });
    return sonuc ? [sonuc.data] : [];
  };
}

/**
 * Kamerayla QR okuyucu açar; kameranın olmadığı ya da izin verilmediği durum için kodu elle
 * yazma alanı da vardır.
 * @param {HTMLElement} kap   Okuyucunun yerleşeceği eleman (içi temizlenir)
 * @param {Object} secenekler
 * @param {'hediye'|'kupon'} secenekler.tur  Kabul edilen QR türü
 * @param {string} [secenekler.baslik]
 * @returns {{ sonuc: Promise<string|null>, durdur: () => void }}  sonuc: tam QR metni; vazgeçilirse null
 */
export function qrOkuyucu(kap, { tur, baslik }) {
  let akis = null, calisiyor = true, coz = null, bitir;
  const sonuc = new Promise((r) => { bitir = r; });

  const video = el('video.oyun-kamera', { playsInline: true, muted: true, autoplay: true });
  video.setAttribute('playsinline', '');
  const durum = el('p.oyun-ipucu', {}, 'Kamera açılıyor…');
  const elleGirdi = el('input', {
    type: 'text', placeholder: tur === 'hediye' ? 'MGH1:…' : 'MGK1:…', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: false, 'aria-label': 'Kodu elle yaz'
  });
  const uyari = el('p.oyun-hata');

  function kabul(metin) {
    const qr = qrAyristir(metin);
    if (!qr) return 'Bu QR oyuna ait değil. Sadece hediye kartlarını ve kafe kuponlarını okut.';
    if (qr.tur !== tur) return tur === 'hediye' ? 'Bu bir kafe kuponu; hediye kartını okut.' : 'Bu bir hediye kartı; kafenin kupon QR\'ını okut.';
    durdur();
    bitir(String(metin).trim());
    return null;
  }

  function durdur() {
    calisiyor = false;
    if (akis) akis.getTracks().forEach((t) => t.stop());
    akis = null;
  }

  kap.replaceChildren(
    el('div.oyun-okuyucu', {},
      baslik ? el('h3', {}, baslik) : null,
      video,
      durum,
      uyari,
      el('form.oyun-satir', {
        onsubmit: (e) => {
          e.preventDefault();
          const hata = kabul(elleGirdi.value);
          uyari.textContent = hata || '';
        }
      },
        elleGirdi,
        el('button', { type: 'submit' }, 'Tamam')),
      el('button.ikincil', { type: 'button', onclick: () => { durdur(); bitir(null); } }, 'Vazgeç'))
  );

  (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera desteklenmiyor');
      akis = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!calisiyor) { durdur(); return; }
      video.srcObject = akis;
      await video.play().catch(() => {});
      coz = await cozucuOlustur();
      durum.textContent = 'Kartı kameraya göster.';
      let sonHata = '';
      const dongu = async () => {
        if (!calisiyor) return;
        try {
          for (const metin of await coz(video)) {
            const hata = kabul(metin);
            if (!hata) return;
            if (hata !== sonHata) uyari.textContent = sonHata = hata;
          }
        } catch { /* tek kare okunamadı */ }
        setTimeout(dongu, 200);
      };
      dongu();
    } catch {
      video.hidden = true;
      durum.textContent = 'Kamera açılamadı. Kartın altındaki kodu elle yazabilirsin.';
    }
  })();

  return { sonuc, durdur };
}
