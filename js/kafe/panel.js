// Kafe paneli (PLAN 3.4): görevli girişi, askıda ürün kuponu oluşturma, kupon kullanma, gün listesi
import { el, islem, bildirimGoster, istemciSec, zamanMetni } from '../oyun/ortak.js';
import { qrCiz } from '../oyun/qr.js';
import { DENEME_KAFESI } from '../oyun/sahte-istemci.js';

const URUNLER = ['Filtre kahve', 'Türk kahvesi', 'Latte', 'Çay', 'Sıcak çikolata', 'Tatlı'];
const KUPON_DURUMU = { hazir: 'Saklanmayı bekliyor', saklandi: 'Saklandı', bulundu: 'Bulundu', kullanildi: 'Kullanıldı' };

const kok = document.getElementById('kafe');
const { istemci, sahte } = await istemciSec();

function ust(baslik) {
  return el('header.oyun-kutu', {},
    el('p', {}, el('strong', {}, 'Hediye Avı · Kafe paneli'), ' · ', sahte ? 'sahte istemci' : 'Supabase'),
    baslik ? el('p.oyun-ipucu', {}, baslik) : null);
}

// Görevli de anonim bir oyuncu hesabıdır; önce takma ad
function katilmaFormu() {
  const ad = el('input', { type: 'text', maxLength: 24, required: true, placeholder: 'Görevli adı' });
  const dugme = el('button.birincil', { type: 'submit' }, 'Devam');
  return el('form.oyun-form', {
    onsubmit: (e) => {
      e.preventDefault();
      islem(dugme, async () => { await istemci.oyuncuOlustur(ad.value); goster(); });
    }
  }, el('h2', {}, 'Görevli girişi'), el('label.oyun-alan', {}, 'Adın', ad), dugme);
}

function kafeGirisFormu() {
  const kafeId = el('input', { type: 'text', required: true, autocomplete: 'off', value: sahte ? DENEME_KAFESI.id : '' });
  const sifre = el('input', { type: 'text', required: true, autocomplete: 'off', placeholder: 'Panel şifresi' });
  sifre.type = 'password';
  const dugme = el('button.birincil', { type: 'submit' }, 'Panele bağlan');
  return el('form.oyun-form', {
    onsubmit: (e) => {
      e.preventDefault();
      islem(dugme, async () => { await istemci.gorevliOl(kafeId.value.trim(), sifre.value); goster(); });
    }
  },
  el('h2', {}, 'Kafeni bağla'),
  el('label.oyun-alan', {}, 'Kafe kimliği', kafeId),
  el('label.oyun-alan', {}, 'Panel şifresi', sifre),
  sahte ? el('p.oyun-ipucu', {}, `Deneme: ${DENEME_KAFESI.id} / ${DENEME_KAFESI.panelSifresi}`) : null,
  dugme);
}

function kuponOlusturmaBolumu() {
  const secim = el('select', {}, URUNLER.map((u) => el('option', {}, u)), el('option', { value: '' }, 'Başka…'));
  const baska = el('input', { type: 'text', maxLength: 60, placeholder: 'Ürün adı', hidden: true });
  secim.addEventListener('change', () => { baska.hidden = secim.value !== ''; });
  const sonuc = el('div');
  const dugme = el('button.birincil', { type: 'submit' }, 'Kupon QR\'ı oluştur');
  return el('form.oyun-form', {
    onsubmit: (e) => {
      e.preventDefault();
      islem(dugme, async () => {
        const urun = secim.value || baska.value;
        const kupon = await istemci.kuponOlustur(urun);
        // Kullanım kodu müşteriye gösterilmez: o kodu hediyeyi bulan kişi cüzdanında görür
        sonuc.replaceChildren(
          el('p', {}, `${urun}: müşteri bu QR'ı Hediye Avı'nda "Sakla › Gümüş" ile okutsun.`),
          el('div.oyun-qr-kart', {}, await qrCiz(kupon.qrKodu, 240), el('code.oyun-kod', {}, kupon.qrKodu)),
          el('button.ikincil', { type: 'button', onclick: () => { sonuc.replaceChildren(); listeyiYenile(); } }, 'Kapat'));
        listeyiYenile();
      });
    }
  },
  el('h2', {}, 'Askıda ürün'),
  el('p.oyun-ipucu', {}, 'Müşteri ödemeyi yaptıktan sonra ürünü seç.'),
  el('label.oyun-alan', {}, 'Ürün', secim), baska,
  dugme, sonuc);
}

function kuponKullanmaBolumu() {
  const kod = el('input', { type: 'text', maxLength: 6, required: true, autocomplete: 'off', autocapitalize: 'characters', placeholder: 'ABC123', 'aria-label': 'Kullanım kodu' });
  const sonuc = el('p');
  const dugme = el('button.birincil', { type: 'submit' }, 'Kullanıldı');
  return el('form.oyun-form', {
    onsubmit: (e) => {
      e.preventDefault();
      sonuc.textContent = '';
      islem(dugme, async () => {
        const r = await istemci.kuponKullan(kod.value);
        sonuc.textContent = `✓ ${r.urun} verildi.`;
        kod.value = '';
        bildirimGoster(`${r.urun} kullanıldı.`);
        listeyiYenile();
      });
    }
  },
  el('h2', {}, 'Kupon kullan'),
  el('p.oyun-ipucu', {}, 'Hediyeyi bulan kişinin cüzdanındaki 6 karakterlik kodu yaz.'),
  el('div.oyun-satir', {}, kod, dugme),
  sonuc);
}

const listeKabi = el('div');
async function listeyiYenile() {
  const liste = await islem(null, () => istemci.kafeKuponlari());
  if (!liste) return;
  const bugun = new Date().toDateString();
  const bugunku = liste.filter((k) => new Date(k.olusturma).toDateString() === bugun || (k.kullanilma && new Date(k.kullanilma).toDateString() === bugun));
  const kullanilan = liste.filter((k) => k.kullanilma && new Date(k.kullanilma).toDateString() === bugun).length;
  listeKabi.replaceChildren(
    el('p.oyun-ipucu', {}, `Bugün ${bugunku.length} kupon hareketi, ${kullanilan} kullanım. Toplam ${liste.length} kupon.`),
    liste.length
      ? el('div.oyun-tablo-kap', {}, el('table.oyun-tablo', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Ürün'), el('th', {}, 'Durum'), el('th', {}, 'Oluşturma'), el('th', {}, 'Kullanım'))),
        el('tbody', {}, liste.map((k) => el('tr', {},
          el('td', {}, k.urun), el('td', {}, KUPON_DURUMU[k.durum] || k.durum),
          el('td', {}, zamanMetni(k.olusturma)), el('td', {}, zamanMetni(k.kullanilma)))))))
      : el('p.oyun-ipucu', {}, 'Henüz kupon yok.'));
}

async function goster() {
  const oyuncu = await istemci.oturumAc();
  if (!oyuncu) {
    kok.replaceChildren(ust(), katilmaFormu());
    return;
  }
  const kafe = await istemci.kafem();
  if (!kafe) {
    kok.replaceChildren(ust(`Görevli: ${oyuncu.takmaAd}`), kafeGirisFormu());
    return;
  }
  kok.replaceChildren(
    ust(`${kafe.ad} · görevli ${oyuncu.takmaAd}`),
    kuponOlusturmaBolumu(),
    kuponKullanmaBolumu(),
    el('section.oyun-kutu', {}, el('h2', {}, 'Kuponlar'),
      el('button.ikincil', { type: 'button', onclick: listeyiYenile }, 'Yenile'),
      listeKabi));
  listeyiYenile();
}

goster();
