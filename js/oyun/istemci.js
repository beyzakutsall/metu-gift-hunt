// Gerçek oyun istemcisi: Supabase (anonim oturum + RPC fonksiyonları + Storage).
// Arayüzü js/oyun/arayuz.js'te; sahte-istemci.js ile aynı biçimi dışa açar.
// Ön yüzde yalnızca publishable anahtar (sb_publishable_...) kullanılır. Tablolar doğrudan
// okunmaz; bütün işlemler supabase/semalar/002_fonksiyonlar.sql'deki fonksiyonlarla yapılır.
import { OyunHatasi, qrAyristir } from './arayuz.js';

// Sabit sürüm; import map'e değil buraya yazılır ki sahte istemciyle çalışan sayfalar indirmesin
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const IPUCU_KOVASI = 'ipucu-fotolari';
const IMZALI_BAGLANTI_SN = 600;           // sunucudaki 10 dakikalık izinle aynı
const EN_BUYUK_FOTO = 2 * 1024 * 1024;    // kovadaki sınırla aynı
const FOTO_UZANTILARI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Sunucu fonksiyonları hata kodunu message alanında döndürür (002_fonksiyonlar.sql, public._hata)
const HATA_KODLARI = new Set([
  'AG', 'OTURUM_YOK', 'GECERSIZ_QR', 'ZATEN_ALINDI', 'KENDI_HEDIYEN', 'UZAK', 'GUNLUK_SINIR',
  'ALTIN_SINIRI', 'YASAK_BOLGE', 'YETKISIZ', 'GECERSIZ_KUPON', 'ZATEN_KULLANILDI', 'GECERSIZ'
]);

function hataCevir(hata) {
  const mesaj = hata?.message || String(hata);
  if (HATA_KODLARI.has(mesaj)) return new OyunHatasi(mesaj, hata.details || mesaj);
  if (hata?.code === '42501') return new OyunHatasi('YETKISIZ', mesaj);       // yetki yok
  if (hata?.code === 'PGRST301' || hata?.status === 401) return new OyunHatasi('OTURUM_YOK', mesaj);
  // PostgREST kodu olmayan hatalar (fetch başarısız vb.) ağ hatasıdır
  return new OyunHatasi(hata?.code ? 'GECERSIZ' : 'AG', mesaj);
}

/**
 * @param {{ supabaseUrl: string, supabaseAnahtari: string }} ayarlar  js/ayarlar.js
 * @param {{ createClient?: Function }} [bagimliliklar]  testler için sahte createClient
 * @returns {Promise<import('./arayuz.js').OyunIstemcisi>}
 */
export async function istemciOlustur(ayarlar, { createClient } = {}) {
  if (!ayarlar?.supabaseUrl) throw new Error('js/ayarlar.js: supabaseUrl eksik');
  const anahtar = ayarlar.supabaseAnahtari;
  if (typeof anahtar !== 'string' || !anahtar.startsWith('sb_publishable_')) {
    throw new Error('js/ayarlar.js: supabaseAnahtari publishable anahtar (sb_publishable_...) olmalı');
  }
  createClient ??= (await import(SUPABASE_JS)).createClient;
  const sb = createClient(ayarlar.supabaseUrl, anahtar, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  async function cagir(ad, parametreler = {}) {
    let yanit;
    try {
      yanit = await sb.rpc(ad, parametreler);
    } catch (hata) {
      throw new OyunHatasi('AG', hata?.message || 'Sunucuya ulaşılamadı');
    }
    if (yanit.error) throw hataCevir(yanit.error);
    return yanit.data ?? null;
  }

  // Oturum yoksa anonim oturum açar; kullanıcı kimliğini döndürür
  async function oturumGarantile() {
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) return data.session.user.id;
    const { data: yeni, error } = await sb.auth.signInAnonymously();
    if (error) throw hataCevir(error);
    return yeni.user.id;
  }

  async function fotoYukle(foto) {
    const uzanti = FOTO_UZANTILARI[foto.type];
    if (!uzanti) throw new OyunHatasi('GECERSIZ', 'Fotoğraf JPEG, PNG ya da WebP olmalı');
    if (foto.size > EN_BUYUK_FOTO) throw new OyunHatasi('GECERSIZ', 'Fotoğraf en fazla 2 MB olabilir');
    const yol = `${await oturumGarantile()}/${crypto.randomUUID()}.${uzanti}`;
    let yanit;
    try {
      yanit = await sb.storage.from(IPUCU_KOVASI).upload(yol, foto, { contentType: foto.type, upsert: false });
    } catch (hata) {
      throw new OyunHatasi('AG', hata?.message || 'Fotoğraf yüklenemedi');
    }
    if (yanit.error) throw new OyunHatasi('AG', yanit.error.message);
    return yol;
  }

  return {
    async oturumAc() {
      await oturumGarantile();
      return cagir('oyuncu_bilgisi');
    },

    oyuncuOlustur: (takmaAd) => cagir('oyuncu_olustur', { p_takma_ad: takmaAd }),

    async hediyeSakla({ seviye, enlem, boylam, ipucuMetni, ipucuFoto, notMetni, kuponQr, cekMarkasi, cekKodu }) {
      let kuponKodu = null;
      if (seviye === 'gumus') {
        const qr = qrAyristir(kuponQr ?? '');
        if (!qr || qr.tur !== 'kupon') throw new OyunHatasi('GECERSIZ_KUPON', 'Bu bir kafe kuponu değil');
        kuponKodu = qr.kod;
      }
      const fotoYolu = ipucuFoto ? await fotoYukle(ipucuFoto) : null;
      return cagir('hediye_sakla', {
        p_seviye: seviye,
        p_enlem: enlem,
        p_boylam: boylam,
        p_ipucu_metni: ipucuMetni,
        p_ipucu_foto: fotoYolu,
        p_not_metni: notMetni ?? null,
        p_kupon_kodu: kuponKodu,
        p_cek_markasi: cekMarkasi ?? null,
        p_cek_kodu: cekKodu ?? null
      });
    },

    async yakinHediyeler(enlem, boylam) {
      return (await cagir('yakin_hediyeler', { p_enlem: enlem, p_boylam: boylam })) ?? [];
    },

    async ipucuGetir(hediyeId, enlem, boylam) {
      const ipucu = await cagir('ipucu_getir', { p_hediye_id: hediyeId, p_enlem: enlem, p_boylam: boylam });
      let fotoUrl = null;
      if (ipucu.fotoYolu) {
        // Okuma izni ipucu_getir'de 10 dakikalığına verildi; bağlantı da o kadar geçerli
        const { data, error } = await sb.storage.from(IPUCU_KOVASI).createSignedUrl(ipucu.fotoYolu, IMZALI_BAGLANTI_SN);
        if (!error) fotoUrl = data.signedUrl;
      }
      return { metin: ipucu.metin, fotoUrl };
    },

    async hediyeAl(qrKodu, enlem, boylam) {
      const qr = qrAyristir(qrKodu ?? '');
      if (!qr || qr.tur !== 'hediye') throw new OyunHatasi('GECERSIZ_QR', 'Bu bir hediye kartı değil');
      return cagir('hediye_al', { p_qr_kodu: qr.kod, p_enlem: enlem, p_boylam: boylam });
    },

    async cuzdan() {
      return (await cagir('cuzdan')) ?? { bulduklarim: [], sakladiklarim: [] };
    },

    async kalpVer(hediyeId) { await cagir('kalp_ver', { p_hediye_id: hediyeId }); },
    async cekSonucu(hediyeId, calisti) { await cagir('cek_sonucu', { p_hediye_id: hediyeId, p_calisti: calisti }); },
    async bildir(hediyeId) { await cagir('bildir', { p_hediye_id: hediyeId }); },

    // ---- kafe paneli (görevlinin oyuncu satırı olması gerekmez)

    // §4'te yok: panel giriş ekranındaki kafe seçimi için
    async kafeListesi() {
      await oturumGarantile();
      return (await cagir('kafe_listesi')) ?? [];
    },

    async gorevliOl(kafeId, panelSifresi) {
      await oturumGarantile();
      return cagir('gorevli_ol', { p_kafe_id: kafeId, p_panel_sifresi: panelSifresi });
    },

    async kafem() {
      await oturumGarantile();
      return cagir('kafem');
    },

    kuponOlustur: (urun) => cagir('kupon_olustur', { p_urun: urun }),
    kuponKullan: (kullanimKodu) => cagir('kupon_kullan', { p_kullanim_kodu: kullanimKodu }),
    async kafeKuponlari() { return (await cagir('kafe_kuponlari')) ?? []; }
  };
}
