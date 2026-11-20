// Sahte oyun istemcisi: Supabase olmadan, aynı arayüz ve aynı kurallarla bellekte çalışır
// (docs/UYGULAMA.md §4). Arayüz geliştirmek, Node'da akış testi yapmak ve sunucusuz demo için.
//
// Tarayıcıda veri localStorage'da tutulur; böylece oyun.html ile kafe.html aynı "sunucuyu"
// görür. Oturum (hangi oyuncu olduğun) sessionStorage'dadır: iki sekme iki ayrı oyuncu olur.
// Node'da ikisi de bellekte kalır; testler ortak bir `veri` nesnesi verip birden çok istemci açar.
import { QR_HEDIYE, QR_KUPON, KURALLAR, OyunHatasi, qrAyristir } from './arayuz.js';
import { SINIR } from '../projeksiyon.js';

const VERI_ANAHTARI = 'mgh-sahte-veri';
const OTURUM_ANAHTARI = 'mgh-sahte-oturum';
const KULLANIM_ALFABESI = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O ve 1/I karışmasın

// Deneme için hazır bir kafe; şifresi README'de yazar
export const DENEME_KAFESI = { id: 'kafe-deneme', ad: 'Deneme Kafesi', panelSifresi: 'kafe123' };

export function bosVeri() {
  return {
    oyuncular: {},   // id → { id, takmaAd, acilim, kalpSayaci, cekSikayeti }
    hediyeler: {},   // id → tüm alanlar (qrOzeti dahil, kodun kendisi değil)
    kafeler: { [DENEME_KAFESI.id]: { id: DENEME_KAFESI.id, ad: DENEME_KAFESI.ad, panelSifresi: DENEME_KAFESI.panelSifresi } },
    gorevliler: {},  // oyuncuId → kafeId
    kuponlar: {},    // id → { id, kafeId, urun, kodOzeti, kullanimKodu, durum, olusturma, kullanilma }
    kalpler: [],     // { hediyeId, oyuncuId }
    sikayetler: []   // { hediyeId, oyuncuId, tur, zaman }
  };
}

// ---------------- Yardımcılar ----------------

function depoBul(ad) {
  try {
    const depo = globalThis[ad];
    if (!depo) return null;
    depo.getItem('__deneme__');
    return depo;
  } catch {
    return null; // gizli pencere, engellenmiş site verisi
  }
}

function rastgeleHex(bayt) {
  const dizi = crypto.getRandomValues(new Uint8Array(bayt));
  return Array.from(dizi, (b) => b.toString(16).padStart(2, '0')).join('');
}

function rastgeleKullanimKodu() {
  const dizi = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(dizi, (b) => KULLANIM_ALFABESI[b % KULLANIM_ALFABESI.length]).join('');
}

async function ozet(metin) {
  const tampon = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(metin));
  return Array.from(new Uint8Array(tampon), (b) => b.toString(16).padStart(2, '0')).join('');
}

// İki konum arası metre (haversine)
export function mesafe(enlem1, boylam1, enlem2, boylam2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((enlem2 - enlem1) * r / 2) ** 2 +
    Math.cos(enlem1 * r) * Math.cos(enlem2 * r) * Math.sin((boylam2 - boylam1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Konumu rastgele yönde 0..enFazla metre kaydırır
function kaydir(enlem, boylam, enFazla) {
  const aci = Math.random() * 2 * Math.PI;
  const uzaklik = Math.random() * enFazla;
  const dEnlem = (uzaklik * Math.cos(aci)) / 111320;
  const dBoylam = (uzaklik * Math.sin(aci)) / (111320 * Math.cos(enlem * Math.PI / 180));
  return { enlem: enlem + dEnlem, boylam: boylam + dBoylam };
}

// Varsayılan yasak bölge kontrolü: yalnızca kampüs sınırı. Harita bilgisiyle (orman, lojman,
// yurt) daha ince kontrolü D akışı ayarlar.yasakMi ile verir.
function kampusDisindaMi(enlem, boylam) {
  return enlem < SINIR.guney || enlem > SINIR.kuzey || boylam < SINIR.bati || boylam > SINIR.dogu;
}

// Gece 22:00-07:00 arası hediyeler gösterilmez
function geceMi(zaman) {
  const saat = zaman.getHours();
  return saat >= 22 || saat < 7;
}

function ayniGun(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function blobdanVeriAdresi(blob) {
  const bayt = new Uint8Array(await blob.arrayBuffer());
  let ikili = '';
  for (let k = 0; k < bayt.length; k += 0x8000) ikili += String.fromCharCode(...bayt.subarray(k, k + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(ikili)}`;
}

function sayiMi(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function metinGerekli(metin, enUzun) {
  const m = typeof metin === 'string' ? metin.trim() : '';
  if (!m || m.length > enUzun) return null;
  return m;
}

// ---------------- İstemci ----------------

/**
 * @param {Object} [ayarlar]
 * @param {Object} [ayarlar.veri]       Ortak sahte veritabanı (testler); yoksa localStorage ya da bellek
 * @param {boolean} [ayarlar.demo]      Görünme gecikmesi 0
 * @param {() => Date} [ayarlar.saat]   Şimdiki zaman (testler gece/gecikme denemek için)
 * @param {(enlem: number, boylam: number) => boolean} [ayarlar.yasakMi]
 * @param {string} [ayarlar.oyuncuId]   Başlangıç oturumu (testler)
 * @returns {Promise<import('./arayuz.js').OyunIstemcisi & { sahte: Object }>}
 */
export async function istemciOlustur(ayarlar = {}) {
  const saat = ayarlar.saat || (() => new Date());
  const yasakMi = ayarlar.yasakMi || kampusDisindaMi;
  const gecikmeDk = ayarlar.demo ? 0 : KURALLAR.GORUNME_GECIKMESI_DK;

  // Veri: verilen nesne > localStorage > bellek
  const kalici = ayarlar.veri ? null : depoBul('localStorage');
  const oturumDepo = ayarlar.veri ? null : depoBul('sessionStorage');
  let bellek = ayarlar.veri || bosVeri();

  function yukle() {
    if (!kalici) return bellek;
    try {
      const ham = kalici.getItem(VERI_ANAHTARI);
      bellek = ham ? JSON.parse(ham) : bosVeri();
    } catch {
      bellek = bosVeri();
    }
    return bellek;
  }
  function kaydet() {
    if (!kalici) return;
    try {
      kalici.setItem(VERI_ANAHTARI, JSON.stringify(bellek));
    } catch (hata) {
      // Kota dolarsa (büyük fotoğraflar) en azından bu sekmede çalışmaya devam edilir
      console.warn('Sahte veri kaydedilemedi:', hata);
    }
  }

  let oyuncuId = ayarlar.oyuncuId || null;
  if (!oyuncuId && oturumDepo) {
    try { oyuncuId = oturumDepo.getItem(OTURUM_ANAHTARI); } catch { /* yok say */ }
  }
  function oturumYaz(id) {
    oyuncuId = id;
    if (oturumDepo) {
      try { oturumDepo.setItem(OTURUM_ANAHTARI, id); } catch { /* yok say */ }
    }
  }

  // Oturum ve oyuncu satırı gerekli işlemler için
  function oyuncuGerekli(v) {
    const o = oyuncuId && v.oyuncular[oyuncuId];
    if (!o) throw new OyunHatasi('OTURUM_YOK', 'Önce takma adınla oyuna katıl.');
    return o;
  }
  const disOyuncu = (o) => ({ id: o.id, takmaAd: o.takmaAd, acilim: o.acilim });
  const takmaAdi = (v, id) => v.oyuncular[id]?.takmaAd ?? '?';

  function hediyeBul(v, hediyeId) {
    const h = v.hediyeler[hediyeId];
    if (!h) throw new OyunHatasi('GECERSIZ', 'Hediye bulunamadı.');
    return h;
  }

  function cuzdanKaydi(v, h) {
    const kayit = {
      hediyeId: h.id,
      seviye: h.seviye,
      saklayanTakmaAd: takmaAdi(v, h.saklayan),
      bulunmaZamani: h.bulunmaZamani
    };
    if (h.seviye === 'kar') {
      kayit.notMetni = h.notMetni;
      kayit.kalpSayisi = v.kalpler.filter((k) => k.hediyeId === h.id).length;
    } else if (h.seviye === 'gumus') {
      const kupon = v.kuponlar[h.kuponId];
      kayit.urun = kupon?.urun;
      kayit.kafeAdi = v.kafeler[kupon?.kafeId]?.ad;
      kayit.kullanimKodu = kupon?.kullanimKodu;
      kayit.kuponDurumu = kupon?.durum;
    } else {
      kayit.cekMarkasi = h.cekMarkasi;
      kayit.cekKodu = h.cekKodu;
      kayit.cekSonucu = h.cekSonucu ?? null;
    }
    return kayit;
  }

  function gorevliKafesi(v) {
    oyuncuGerekli(v);
    const kafeId = v.gorevliler[oyuncuId];
    const kafe = kafeId && v.kafeler[kafeId];
    if (!kafe) throw new OyunHatasi('YETKISIZ', 'Bu işlem yalnızca kafe görevlileri için.');
    return kafe;
  }

  /** @type {import('./arayuz.js').OyunIstemcisi} */
  const istemci = {
    async oturumAc() {
      const v = yukle();
      if (!oyuncuId) oturumYaz('sahte-' + rastgeleHex(8));
      const o = v.oyuncular[oyuncuId];
      return o ? disOyuncu(o) : null;
    },

    async oyuncuOlustur(takmaAd) {
      const v = yukle();
      if (!oyuncuId) oturumYaz('sahte-' + rastgeleHex(8));
      const ad = metinGerekli(takmaAd, 24);
      if (!ad || ad.length < 2) throw new OyunHatasi('GECERSIZ', 'Takma ad 2-24 karakter olmalı.');
      const var_ = v.oyuncular[oyuncuId];
      if (var_) return disOyuncu(var_);
      const o = { id: oyuncuId, takmaAd: ad, acilim: 0, kalpSayaci: 0, cekSikayeti: 0, olusturma: saat().toISOString() };
      v.oyuncular[oyuncuId] = o;
      kaydet();
      return disOyuncu(o);
    },

    async hediyeSakla(girdi) {
      const v = yukle();
      const o = oyuncuGerekli(v);
      const { seviye, enlem, boylam } = girdi || {};
      if (!['kar', 'gumus', 'altin'].includes(seviye)) throw new OyunHatasi('GECERSIZ', 'Geçersiz hediye seviyesi.');
      if (!sayiMi(enlem) || !sayiMi(boylam)) throw new OyunHatasi('GECERSIZ', 'Konum alınamadı.');
      const ipucuMetni = metinGerekli(girdi.ipucuMetni, 280);
      if (!ipucuMetni) throw new OyunHatasi('GECERSIZ', 'İpucu yazmalısın (en fazla 280 karakter).');
      if (yasakMi(enlem, boylam)) throw new OyunHatasi('YASAK_BOLGE', 'Buraya hediye saklanamaz.');

      const simdi = saat();
      const bugunku = Object.values(v.hediyeler).filter((h) => h.saklayan === o.id && ayniGun(new Date(h.saklanmaZamani), simdi));
      if (bugunku.length >= KURALLAR.GUNLUK_SAKLAMA) throw new OyunHatasi('GUNLUK_SINIR', `Günde en fazla ${KURALLAR.GUNLUK_SAKLAMA} hediye saklayabilirsin.`);

      const h = {
        id: 'h-' + rastgeleHex(8),
        saklayan: o.id,
        seviye,
        enlem, boylam,
        ipucuMetni,
        ipucuFoto: null,
        durum: 'saklandi',
        bulan: null,
        saklanmaZamani: simdi.toISOString(),
        gorunmeZamani: new Date(simdi.getTime() + gecikmeDk * 60000).toISOString(),
        bulunmaZamani: null,
        bildirenler: []
      };

      let kupon = null;
      if (seviye === 'kar') {
        h.notMetni = metinGerekli(girdi.notMetni, 1000);
        if (!h.notMetni) throw new OyunHatasi('GECERSIZ', 'Kar tanesi hediyesi için bir not yaz (en fazla 1000 karakter).');
      } else if (seviye === 'gumus') {
        const qr = qrAyristir(girdi.kuponQr || '');
        if (!qr || qr.tur !== 'kupon') throw new OyunHatasi('GECERSIZ_KUPON', 'Kafenin kupon QR\'ını okutmalısın.');
        const kodOzeti = await ozet(QR_KUPON + qr.kod);
        kupon = Object.values(v.kuponlar).find((k) => k.kodOzeti === kodOzeti);
        if (!kupon || kupon.durum !== 'hazir') throw new OyunHatasi('GECERSIZ_KUPON', 'Bu kupon geçersiz ya da zaten saklanmış.');
        h.kuponId = kupon.id;
      } else {
        if (o.cekSikayeti >= 3) throw new OyunHatasi('YETKISIZ', 'Çalışmayan çek şikâyetleri yüzünden altın saklayamazsın.');
        if (bugunku.some((x) => x.seviye === 'altin')) throw new OyunHatasi('ALTIN_SINIRI', `Günde en fazla ${KURALLAR.GUNLUK_ALTIN} altın hediye saklayabilirsin.`);
        h.cekMarkasi = metinGerekli(girdi.cekMarkasi, 60);
        h.cekKodu = metinGerekli(girdi.cekKodu, 200);
        if (!h.cekMarkasi || !h.cekKodu) throw new OyunHatasi('GECERSIZ', 'Çekin markasını ve kodunu yaz.');
        h.cekSonucu = null;
      }

      if (girdi.ipucuFoto) h.ipucuFoto = await blobdanVeriAdresi(girdi.ipucuFoto);
      const gosterim = kaydir(enlem, boylam, KURALLAR.KAYDIRMA_EN_FAZLA_M);
      h.gosterimEnlem = gosterim.enlem;
      h.gosterimBoylam = gosterim.boylam;

      const kod = rastgeleHex(16);
      const qrKodu = QR_HEDIYE + kod;
      h.qrOzeti = await ozet(qrKodu);

      if (kupon) kupon.durum = 'saklandi';
      // Altının açılımı bulan "kod çalıştı" deyince verilir
      if (seviye !== 'altin') o.acilim += KURALLAR.ACILIM[seviye];
      h.verilenAcilim = seviye === 'altin' ? 0 : KURALLAR.ACILIM[seviye];
      v.hediyeler[h.id] = h;
      kaydet();
      return { hediyeId: h.id, qrKodu };
    },

    async yakinHediyeler(enlem, boylam) {
      const v = yukle();
      const o = oyuncuGerekli(v);
      if (!sayiMi(enlem) || !sayiMi(boylam)) throw new OyunHatasi('GECERSIZ', 'Konum alınamadı.');
      const simdi = saat();
      if (geceMi(simdi)) return [];
      const n = KURALLAR.BASLANGIC_GORUS + o.acilim;
      return Object.values(v.hediyeler)
        .filter((h) => h.durum === 'saklandi' && h.saklayan !== o.id && new Date(h.gorunmeZamani) <= simdi)
        .map((h) => ({ h, d: mesafe(enlem, boylam, h.enlem, h.boylam) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, n)
        .map(({ h }) => ({ id: h.id, seviye: h.seviye, gosterimEnlem: h.gosterimEnlem, gosterimBoylam: h.gosterimBoylam }));
    },

    async ipucuGetir(hediyeId, enlem, boylam) {
      const v = yukle();
      oyuncuGerekli(v);
      const h = hediyeBul(v, hediyeId);
      if (h.durum !== 'saklandi') throw new OyunHatasi('GECERSIZ', 'Bu hediye artık haritada değil.');
      if (!sayiMi(enlem) || !sayiMi(boylam)) throw new OyunHatasi('GECERSIZ', 'Konum alınamadı.');
      if (mesafe(enlem, boylam, h.enlem, h.boylam) > KURALLAR.IPUCU_MESAFESI_M) {
        throw new OyunHatasi('UZAK', `İpucu için ${KURALLAR.IPUCU_MESAFESI_M} m yakına gel.`);
      }
      return { metin: h.ipucuMetni, fotoUrl: h.ipucuFoto };
    },

    async hediyeAl(qrKodu, enlem, boylam) {
      const v = yukle();
      const o = oyuncuGerekli(v);
      const qr = qrAyristir(qrKodu || '');
      if (!qr || qr.tur !== 'hediye') throw new OyunHatasi('GECERSIZ_QR', 'Bu bir hediye kartı değil.');
      const qrOzeti = await ozet(QR_HEDIYE + qr.kod);
      const h = Object.values(v.hediyeler).find((x) => x.qrOzeti === qrOzeti);
      if (!h || h.durum === 'gizlendi') throw new OyunHatasi('GECERSIZ_QR', 'Bu kart tanınmadı.');
      if (h.saklayan === o.id) throw new OyunHatasi('KENDI_HEDIYEN', 'Kendi sakladığın hediyeyi alamazsın.');
      if (h.durum !== 'saklandi') throw new OyunHatasi('ZATEN_ALINDI', 'Bu hediyeyi başkası bulmuş.');
      if (!sayiMi(enlem) || !sayiMi(boylam)) throw new OyunHatasi('GECERSIZ', 'Konum alınamadı.');
      if (mesafe(enlem, boylam, h.enlem, h.boylam) > KURALLAR.ALMA_MESAFESI_M) {
        throw new OyunHatasi('UZAK', 'Kartın saklandığı yerden çok uzaktasın.');
      }
      h.durum = 'bulundu';
      h.bulan = o.id;
      h.bulunmaZamani = saat().toISOString();
      if (h.kuponId && v.kuponlar[h.kuponId]) v.kuponlar[h.kuponId].durum = 'bulundu';
      kaydet();
      return cuzdanKaydi(v, h);
    },

    async cuzdan() {
      const v = yukle();
      const o = oyuncuGerekli(v);
      const hepsi = Object.values(v.hediyeler);
      const yeniOnce = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
      return {
        bulduklarim: hepsi.filter((h) => h.bulan === o.id)
          .sort((a, b) => yeniOnce(a.bulunmaZamani, b.bulunmaZamani))
          .map((h) => cuzdanKaydi(v, h)),
        sakladiklarim: hepsi.filter((h) => h.saklayan === o.id)
          .sort((a, b) => yeniOnce(a.saklanmaZamani, b.saklanmaZamani))
          .map((h) => {
            const k = { hediyeId: h.id, seviye: h.seviye, durum: h.durum, saklanmaZamani: h.saklanmaZamani };
            // Saklayan, bulanın takma adını bulunduktan sonra görür
            if (h.bulan) k.bulanTakmaAd = takmaAdi(v, h.bulan);
            return k;
          })
      };
    },

    async kalpVer(hediyeId) {
      const v = yukle();
      const o = oyuncuGerekli(v);
      const h = hediyeBul(v, hediyeId);
      if (h.seviye !== 'kar') throw new OyunHatasi('GECERSIZ', 'Yalnızca not hediyelerine kalp verilir.');
      if (h.bulan !== o.id) throw new OyunHatasi('YETKISIZ', 'Yalnızca bulduğun notlara kalp verebilirsin.');
      if (v.kalpler.some((k) => k.hediyeId === h.id && k.oyuncuId === o.id)) return;
      v.kalpler.push({ hediyeId: h.id, oyuncuId: o.id });
      // Saklayanın notları toplam 5 kalp aldıkça +3 açılım
      const saklayan = v.oyuncular[h.saklayan];
      if (saklayan) {
        saklayan.kalpSayaci = (saklayan.kalpSayaci || 0) + 1;
        if (saklayan.kalpSayaci % KURALLAR.KALP_ESIGI === 0) saklayan.acilim += KURALLAR.KALP_ODULU;
      }
      kaydet();
    },

    async cekSonucu(hediyeId, calisti) {
      const v = yukle();
      const o = oyuncuGerekli(v);
      const h = hediyeBul(v, hediyeId);
      if (h.seviye !== 'altin') throw new OyunHatasi('GECERSIZ', 'Bu bir altın hediye değil.');
      if (h.bulan !== o.id) throw new OyunHatasi('YETKISIZ', 'Yalnızca bulan kişi sonucu bildirebilir.');
      if (h.cekSonucu !== null && h.cekSonucu !== undefined) throw new OyunHatasi('GECERSIZ', 'Sonucu zaten bildirdin.');
      h.cekSonucu = !!calisti;
      const saklayan = v.oyuncular[h.saklayan];
      if (calisti) {
        if (saklayan) saklayan.acilim += KURALLAR.ACILIM.altin;
        h.verilenAcilim = KURALLAR.ACILIM.altin;
      } else {
        v.sikayetler.push({ hediyeId: h.id, oyuncuId: o.id, tur: 'cek_calismadi', zaman: saat().toISOString() });
        if (saklayan) {
          // O hediyeden kazanılan açılım (altında henüz yok) geri alınır, şikâyet sayılır
          saklayan.acilim = Math.max(0, saklayan.acilim - (h.verilenAcilim || 0));
          saklayan.cekSikayeti = (saklayan.cekSikayeti || 0) + 1;
        }
        h.verilenAcilim = 0;
      }
      kaydet();
    },

    async bildir(hediyeId) {
      const v = yukle();
      const o = oyuncuGerekli(v);
      const h = hediyeBul(v, hediyeId);
      if (h.saklayan === o.id) throw new OyunHatasi('GECERSIZ', 'Kendi hediyeni bildiremezsin.');
      if (v.sikayetler.some((s) => s.hediyeId === h.id && s.oyuncuId === o.id && s.tur === 'uygunsuz')) return;
      v.sikayetler.push({ hediyeId: h.id, oyuncuId: o.id, tur: 'uygunsuz', zaman: saat().toISOString() });
      const sayi = v.sikayetler.filter((s) => s.hediyeId === h.id && s.tur === 'uygunsuz').length;
      if (sayi >= 2 && h.durum === 'saklandi') h.durum = 'gizlendi';
      kaydet();
    },

    async gorevliOl(kafeId, panelSifresi) {
      const v = yukle();
      oyuncuGerekli(v);
      const kafe = v.kafeler[kafeId];
      if (!kafe || kafe.panelSifresi !== panelSifresi) throw new OyunHatasi('YETKISIZ', 'Kafe ya da panel şifresi yanlış.');
      v.gorevliler[oyuncuId] = kafe.id;
      kaydet();
      return { id: kafe.id, ad: kafe.ad };
    },

    async kafem() {
      const v = yukle();
      if (!oyuncuId || !v.oyuncular[oyuncuId]) return null;
      const kafe = v.kafeler[v.gorevliler[oyuncuId]];
      return kafe ? { id: kafe.id, ad: kafe.ad } : null;
    },

    async kuponOlustur(urun) {
      const v = yukle();
      const kafe = gorevliKafesi(v);
      const ad = metinGerekli(urun, 60);
      if (!ad) throw new OyunHatasi('GECERSIZ', 'Ürün adı yaz.');
      let kullanimKodu;
      do kullanimKodu = rastgeleKullanimKodu();
      while (Object.values(v.kuponlar).some((k) => k.kullanimKodu === kullanimKodu));
      const qrKodu = QR_KUPON + rastgeleHex(16);
      const kupon = {
        id: 'k-' + rastgeleHex(8),
        kafeId: kafe.id,
        urun: ad,
        kodOzeti: await ozet(qrKodu),
        kullanimKodu,
        durum: 'hazir',
        olusturma: saat().toISOString(),
        kullanilma: null
      };
      v.kuponlar[kupon.id] = kupon;
      kaydet();
      return { kuponId: kupon.id, qrKodu, kullanimKodu };
    },

    async kuponKullan(kullanimKodu) {
      const v = yukle();
      const kafe = gorevliKafesi(v);
      const kod = String(kullanimKodu || '').trim().toUpperCase();
      const kupon = Object.values(v.kuponlar).find((k) => k.kullanimKodu === kod);
      if (!kupon) throw new OyunHatasi('GECERSIZ_KUPON', 'Bu kod bulunamadı.');
      if (kupon.kafeId !== kafe.id) throw new OyunHatasi('YETKISIZ', 'Bu kupon başka bir kafenin.');
      if (kupon.durum === 'kullanildi') throw new OyunHatasi('ZATEN_KULLANILDI', 'Bu kupon zaten kullanılmış.');
      if (kupon.durum !== 'bulundu') throw new OyunHatasi('GECERSIZ_KUPON', 'Bu kupon henüz bir oyuncu tarafından bulunmadı.');
      kupon.durum = 'kullanildi';
      kupon.kullanilma = saat().toISOString();
      kaydet();
      return { urun: kupon.urun, kullanildi: true };
    },

    async kafeKuponlari() {
      const v = yukle();
      const kafe = gorevliKafesi(v);
      return Object.values(v.kuponlar)
        .filter((k) => k.kafeId === kafe.id)
        .sort((a, b) => (a.olusturma < b.olusturma ? 1 : -1))
        .map((k) => ({ id: k.id, urun: k.urun, durum: k.durum, kullanimKodu: k.kullanimKodu, olusturma: k.olusturma, kullanilma: k.kullanilma }));
    }
  };

  // Yalnızca sahte istemcide: deneme kolaylıkları
  istemci.sahte = {
    // Başka bir oyuncu gibi davran (yeni anonim oturum ya da verilen kimlik)
    oyuncuDegistir(id) {
      oturumYaz(id || 'sahte-' + rastgeleHex(8));
      return oyuncuId;
    },
    oyuncuId: () => oyuncuId,
    sifirla() {
      bellek = bosVeri();
      kaydet();
    },
    veri: () => yukle()
  };

  return istemci;
}
