// Oyun istemcisinin arayüzü (docs/UYGULAMA.md §4). Gerçek istemci (istemci.js) ile sahte
// istemci (sahte-istemci.js) aynı biçimi dışa açar:
//   export async function istemciOlustur(ayarlar) → OyunIstemcisi
// Arayüz kodu bu dosyadaki sabitleri ve OyunHatasi'nı kullanır, hangi istemcinin
// arkada çalıştığını bilmez.

export const QR_HEDIYE = 'MGH1:'; // hediye kartı:  MGH1:<32 hex = 128 bit>
export const QR_KUPON = 'MGK1:';  // kafe kuponu:   MGK1:<32 hex>

// Kurallar: iki istemci de aynı değerleri kullanır
export const KURALLAR = {
  ALMA_MESAFESI_M: 60,     // QR okutma, hediyenin bu kadar yakınında olmalı
  IPUCU_MESAFESI_M: 30,    // ipucu bu mesafede açılır
  GUNLUK_SAKLAMA: 3,
  GUNLUK_ALTIN: 1,
  KAYDIRMA_EN_FAZLA_M: 15, // haritadaki gösterim konumu en fazla bu kadar kaydırılır
  GORUNME_GECIKMESI_DK: 30, // ayarlar.demo ise 0
  BASLANGIC_GORUS: 3,      // her oyuncu en yakın 3 hediyeyi görür, üstüne açılım eklenir
  ACILIM: { kar: 1, gumus: 3, altin: 10 },
  KALP_ESIGI: 5,           // bir not 5 kalp alınca saklayana +3
  KALP_ODULU: 3
};

/**
 * @typedef {'AG' | 'OTURUM_YOK' | 'GECERSIZ_QR' | 'ZATEN_ALINDI' | 'KENDI_HEDIYEN' | 'UZAK'
 *   | 'GUNLUK_SINIR' | 'ALTIN_SINIRI' | 'YASAK_BOLGE' | 'YETKISIZ' | 'GECERSIZ_KUPON'
 *   | 'ZATEN_KULLANILDI' | 'GECERSIZ'} HataKodu
 */

export class OyunHatasi extends Error {
  /** @param {HataKodu} kod @param {string} [mesaj] */
  constructor(kod, mesaj) {
    super(mesaj || kod);
    this.name = 'OyunHatasi';
    this.kod = kod;
  }
}

/** @typedef {'kar' | 'gumus' | 'altin'} Seviye */

/** @typedef {{ id: string, takmaAd: string, acilim: number }} Oyuncu */
/** @typedef {{ id: string, ad: string }} Kafe */

/**
 * @typedef {Object} CuzdanKaydi
 * @property {string} hediyeId
 * @property {Seviye} seviye
 * @property {string} saklayanTakmaAd
 * @property {string} bulunmaZamani        ISO zaman
 * @property {string} [notMetni]           kar
 * @property {number} [kalpSayisi]         kar
 * @property {string} [urun]               gümüş
 * @property {string} [kafeAdi]            gümüş
 * @property {string} [kullanimKodu]       gümüş, 6 karakter
 * @property {string} [kuponDurumu]        gümüş: 'bulundu' | 'kullanildi'
 * @property {string} [cekMarkasi]         altın
 * @property {string} [cekKodu]            altın
 * @property {boolean|null} [cekSonucu]    altın: bulan onayladı mı
 */

/**
 * @typedef {Object} SaklananKayit
 * @property {string} hediyeId
 * @property {Seviye} seviye
 * @property {string} durum                'saklandi' | 'bulundu' | 'gizlendi'
 * @property {string} saklanmaZamani
 * @property {string} [bulanTakmaAd]
 */

/**
 * @typedef {Object} HediyeSaklamaGirdisi
 * @property {Seviye} seviye
 * @property {number} enlem
 * @property {number} boylam
 * @property {string} ipucuMetni
 * @property {Blob} [ipucuFoto]
 * @property {string} [notMetni]     kar
 * @property {string} [kuponQr]      gümüş: kafenin gösterdiği MGK1:... metni
 * @property {string} [cekMarkasi]   altın
 * @property {string} [cekKodu]      altın
 */

/**
 * @typedef {Object} OyunIstemcisi
 * @property {() => Promise<Oyuncu|null>} oturumAc
 *   Anonim oturum açar; oyuncu satırı yoksa null
 * @property {(takmaAd: string) => Promise<Oyuncu>} oyuncuOlustur
 * @property {(girdi: HediyeSaklamaGirdisi) => Promise<{hediyeId: string, qrKodu: string}>} hediyeSakla
 *   qrKodu yalnızca bu yanıtta bir kez döner
 * @property {(enlem: number, boylam: number) => Promise<Array<{id: string, seviye: Seviye, gosterimEnlem: number, gosterimBoylam: number}>>} yakinHediyeler
 * @property {(hediyeId: string, enlem: number, boylam: number) => Promise<{metin: string, fotoUrl: string|null}>} ipucuGetir
 *   30 m dışında UZAK
 * @property {(qrKodu: string, enlem: number, boylam: number) => Promise<CuzdanKaydi>} hediyeAl
 * @property {() => Promise<{bulduklarim: CuzdanKaydi[], sakladiklarim: SaklananKayit[]}>} cuzdan
 * @property {(hediyeId: string) => Promise<void>} kalpVer
 * @property {(hediyeId: string, calisti: boolean) => Promise<void>} cekSonucu
 * @property {(hediyeId: string) => Promise<void>} bildir
 *   Uygunsuz içerik bildirimi
 * @property {(kafeId: string, panelSifresi: string) => Promise<Kafe>} gorevliOl
 * @property {() => Promise<Kafe|null>} kafem
 * @property {(urun: string) => Promise<{kuponId: string, qrKodu: string, kullanimKodu: string}>} kuponOlustur
 *   Görevlinin kafesi için
 * @property {(kullanimKodu: string) => Promise<{urun: string, kullanildi: true}>} kuponKullan
 * @property {() => Promise<Array<{id: string, urun: string, durum: string, kullanimKodu: string, olusturma: string, kullanilma: string|null}>>} kafeKuponlari
 */

// QR metnini ayrıştırır: { tur: 'hediye' | 'kupon', kod } ya da null (başka bir QR)
export function qrAyristir(metin) {
  const m = /^(MGH1|MGK1):([0-9a-f]{32})$/.exec(String(metin).trim());
  if (!m) return null;
  return { tur: m[1] === 'MGH1' ? 'hediye' : 'kupon', kod: m[2] };
}
