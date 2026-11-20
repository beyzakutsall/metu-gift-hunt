// Oyun ekranlarının ortak yardımcıları: küçük DOM kurucu, hata mesajları, istemci seçimi
import { OyunHatasi } from './arayuz.js';

// el('button.birincil', { onclick }, 'Sakla') → <button class="birincil">Sakla</button>
export function el(etiket, ozellikler = {}, ...cocuklar) {
  const [ad, ...siniflar] = etiket.split('.');
  const e = document.createElement(ad || 'div');
  if (siniflar.length) e.className = siniflar.join(' ');
  for (const [k, d] of Object.entries(ozellikler || {})) {
    if (d === undefined || d === null || d === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), d);
    else if (k === 'veri') Object.assign(e.dataset, d);
    else if (k in e && k !== 'list') e[k] = d;
    else e.setAttribute(k, d === true ? '' : d);
  }
  for (const c of cocuklar.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : String(c));
  }
  return e;
}

const MESAJLAR = {
  AG: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.',
  OTURUM_YOK: 'Önce takma adınla oyuna katıl.',
  GECERSIZ_QR: 'Bu bir hediye kartı değil. Sadece uygulamanın içinden okut.',
  ZATEN_ALINDI: 'Bu hediyeyi başkası senden önce bulmuş.',
  KENDI_HEDIYEN: 'Kendi sakladığın hediyeyi alamazsın.',
  UZAK: 'Hediyenin saklandığı yere yeterince yakın değilsin.',
  GUNLUK_SINIR: 'Bugünkü saklama hakkın doldu.',
  ALTIN_SINIRI: 'Bugün zaten bir altın hediye sakladın.',
  YASAK_BOLGE: 'Buraya hediye saklanamaz (orman, lojman, yurt ya da kampüs dışı).',
  YETKISIZ: 'Bu işlem için yetkin yok.',
  GECERSIZ_KUPON: 'Kupon geçersiz.',
  ZATEN_KULLANILDI: 'Bu kupon zaten kullanılmış.',
  GECERSIZ: 'Bilgiler eksik ya da geçersiz.'
};

// Hatadan kullanıcıya gösterilecek metin
export function hataMetni(hata) {
  if (hata instanceof OyunHatasi || hata?.kod) {
    // İstemcinin kendi mesajı daha ayrıntılıysa onu kullan
    return hata.message && hata.message !== hata.kod ? hata.message : (MESAJLAR[hata.kod] || hata.kod);
  }
  console.error(hata);
  return 'Beklenmeyen bir hata oldu.';
}

// Kısa süre görünen bildirim
export function bildirimGoster(metin, tur = 'bilgi') {
  let kap = document.getElementById('oyun-bildirimler');
  if (!kap) {
    kap = el('div.oyun-bildirimler', { id: 'oyun-bildirimler', role: 'status', 'aria-live': 'polite' });
    document.body.append(kap);
  }
  const b = el(`div.oyun-bildirim.${tur}`, {}, metin);
  kap.append(b);
  setTimeout(() => b.remove(), 4000);
}

// İşlem sürerken düğmeyi kilitler, hata olursa bildirir
export async function islem(dugme, is) {
  if (dugme) dugme.disabled = true;
  try {
    return await is();
  } catch (hata) {
    bildirimGoster(hataMetni(hata), 'hata');
    return undefined;
  } finally {
    if (dugme) dugme.disabled = false;
  }
}

export const SEVIYE_ADI = { kar: '❄️ Kar tanesi', gumus: '🥈 Gümüş', altin: '🥇 Altın' };

export function zamanMetni(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// İstemci seçimi: ?sahte=1 ya da js/ayarlar.js yoksa sahte istemci; varsa gerçek Supabase istemcisi
export async function istemciSec() {
  const sahteIstendi = new URLSearchParams(location.search).has('sahte');
  let ayarlar = null;
  if (!sahteIstendi) {
    try {
      const m = await import(new URL('../ayarlar.js', import.meta.url).href);
      ayarlar = m.default ?? m.ayarlar ?? m;
    } catch {
      ayarlar = null; // ayarlar.js yok: Supabase kurulmamış
    }
  }
  if (ayarlar) {
    const { istemciOlustur } = await import('./istemci.js');
    return { istemci: await istemciOlustur(ayarlar), sahte: false };
  }
  const { istemciOlustur } = await import('./sahte-istemci.js');
  return { istemci: await istemciOlustur({ demo: true }), sahte: true };
}
