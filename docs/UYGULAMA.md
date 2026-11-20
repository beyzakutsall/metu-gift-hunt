# Uygulama planı (A-D akışları)

`docs/PLAN.md`'nin koda dökülmüş hali. Bu belge PLAN.md'yi okuduktan sonra okunur. İkisi
çeliştiğinde aşağıdaki **"PLAN.md'ye ekler"** bölümü geçerlidir.

Son güncelleme: 20 Kasım 2026

---

## 0. PLAN.md'ye ekler ve değişiklikler

| # | Konu | Geçerli karar |
|---|---|---|
| 1 | Bina tabelaları | Her adlandırılmış binanın önüne ahşap voksel tabela (Minecraft tabelası gibi). Yeri: OSM `entrance` düğümü varsa onun önü, yoksa binanın en yakın yürüme yoluna bakan kenarı. Yazı `data/bina-adlari.json`'daki kısa ad, canvas ile üretilen piksel yazı. Tabelalar binalara, ağaçlara ve yola girmez. |
| 2 | Yüzen etiketler | Yalnızca **önemli** binalar (`onemli: true` + alanı büyük olanlar). Uzaktan görünür; kamera yaklaşınca solar ve kaybolur, o mesafede tabelalar okunur. PLAN 2.2'deki "yakınlaştıkça diğerleri belirir" davranışını tabelalar üstlenir. |
| 3 | Supabase anahtarı | Ön yüzde legacy `anon` anahtarı yerine **publishable anahtar** (`sb_publishable_...`). `js/ayarlar.ornek.js` repoda, gerçek `js/ayarlar.js` `.gitignore`'da; Beyza doldurur. **Secret anahtar hiçbir yerde kullanılmaz, istenmez.** |
| 4 | Supabase izinleri | Projede "yeni tablolara otomatik API erişimi" **kapalı**, "yeni tablolarda otomatik RLS" **açık**. Bu yüzden SQL dosyaları her tablo, görünüm, dizi (sequence) ve fonksiyon için `GRANT`/`REVOKE`'ları açıkça yazar; RLS'i de açıkça açar (`alter table ... enable row level security`). |
| 5 | SQL'i kim çalıştırır | Beyza SQL Editor'e yapıştırır. Claude çalıştıramaz; C akışı **sahte istemciyle** (`js/oyun/sahte-istemci.js`) test edilir. |
| 6 | 3D modeller | İnternetten model **indirilmez**. Simge nesnelerin hepsi (heykel ve çeşme dahil) kodla voksel üretilir. Hazır model gerekirse aday kaynaklar, lisansları ve bağlantıları `docs/MODEL-ADAYLARI.md`'ye yazılır; karar Beyza'nın. |
| 7 | Overpass | `tools/veri-indir.ps1` çalıştırılabilir. Yeni `data/campus.json` ayrı commit. |
| 8 | E akışı | Yapılmaz; Vercel'i Beyza kurar. |
| 9 | CREDITS.md | Mevcut CC BY yılbaşı ağacı (README'de) da buraya taşınır. |

---

## 1. Akışlar ve paralellik

```
main ─► uygulama-plani (bu belge)
          ├─ A. harita-detay  ─────────────────────┐
          ├─ B. oyun-sunucu   (önce imzalar, §4) ──┼─► D. entegrasyon
          └─ C. oyun-arayuz   (sahte istemciyle) ──┘
```

- A, B ve C aynı anda başlar; her biri kendi branch'inde ve kendi `git worktree`'sinde.
- C, B'yi beklemez: §4'teki arayüz bu belgede sabitlendi. C `sahte-istemci.js` ile çalışır; B
  `istemci.js`'i aynı arayüzle yazar.
- D, A, B ve C birleştikten sonra başlar.
- Branch'ler `uygulama-plani`'nden açılır (bu belge her akışta bulunsun diye).

---

## 2. Dosya sahipliği

| Dosya | Akış | Not |
|---|---|---|
| `tools/overpass-sorgusu.txt`, `data/campus.json` | A | Veri ayrı commit |
| `data/bina-adlari.json`, `data/elle-eklenen.json` | A | Elle düzenlenir, indirme betiği ezmez |
| `js/doluluk.js` | A | Ortak doluluk ızgarası (§3.A) |
| `js/etiketler.js`, `js/tabelalar.js`, `js/piksel-yazi.js` | A | Yüzen etiketler, voksel tabelalar, canvas yazı |
| `js/nesneler.js` | A | Simge nesneler (voksel, InstancedMesh) |
| `js/agaclar.js` | A | Yalnızca doluluk ızgarasına uyması için |
| `CREDITS.md`, `docs/MODEL-ADAYLARI.md` | A | |
| `supabase/semalar/001_*.sql` … | B | Sırayla yapıştırılır |
| `supabase/test.sql` | B | |
| `js/oyun/arayuz.js` | B | §4'teki JSDoc imzaları + `OyunHatasi` + QR biçimleri. **B'nin ilk commit'i** |
| `js/oyun/istemci.js` | B | Gerçek Supabase istemcisi |
| `js/ayarlar.ornek.js`, `.gitignore` | B | |
| `js/oyun/sahte-istemci.js` | C | Bellekte çalışan, aynı arayüz |
| `js/oyun/sakla.js`, `qr.js`, `cuzdan.js`, `arayuz.css` | C | |
| `oyun.html` | C | Haritasız deneme sayfası (D'de haritaya bağlanır) |
| `kafe.html`, `js/kafe/*.js` | C | |
| `tests/*.mjs` | C | Node ile sahte istemci akış testleri |
| `js/oyun/haritada.js` | D | |
| `js/main.js`, `minecraft.html` | A, D | A yalnızca import + çağrı satırı ekler |
| `README.md` | Her akış kendi bölümünü ekler | Çakışmalar D'de çözülür |

---

## 3. Commit listeleri

### A. harita-detay

1. **Overpass sorgusu genişletildi**: Banklar, çöp kutuları, lambalar, `tourism=artwork`, `historic`, `entrance`, piknik masaları, çeşmeler, bisiklet parkları, kafeler/yemek yerleri, `name` taşıyan alanlar. Bina girişleri `node["entrance"]` ile (etiketli düğüm olarak) çıktıya girer.
2. **Veri: yeni campus.json** (yalnızca `data/campus.json`, ayrı commit).
3. **Bina kısa adları**: `data/bina-adlari.json` (`osm_id → { ad, onemli? }`) ve ad seçimi (dosya → `short_name` → `name`). Kütüphane, Çarşı, Mediko, Kafeterya ve bölüm binaları için kısa adlar.
4. **Doluluk ızgarası**: `js/doluluk.js`. Bina, yol, tabela ve nesne hücrelerini işaretler. Ağaç yerleşimi (`agaclar.js`) bu ızgaraya uyar. Sıra: binalar → tabelalar → nesneler → ağaçlar.
5. **Piksel yazı**: `js/piksel-yazi.js`. Canvas'a piksel fontla yazar, `NearestFilter` doku döndürür. Türkçe karakterler (ç ğ ı İ ö ş ü) desteklenir.
6. **Voksel tabelalar**: `js/tabelalar.js`. Ahşap direk ve pano (InstancedMesh), yazı panonun ön yüzünde (tabela başına küçük bir doku atlası ya da tek atlas). Yer seçimi: giriş düğümü varsa onun önü, yoksa en yakın `ZEMIN.TAS` hücresine bakan kenar. Bina, yol ve ağaç hücrelerine girmez. Konsola tabela sayısı yazılır.
7. **Yüzen etiketler**: `js/etiketler.js`. Önemli binalar için `THREE.Sprite`, yarı saydam koyu kutu, beyaz piksel yazı. Kamera mesafesine göre solar; yakında görünmez.
8. **Simge nesneler**: `js/nesneler.js`. Bank, çöp kutusu, lamba, piknik masası, çeşme, bisiklet parkı, heykel/anıt, giriş eşiği; hepsi kodla voksel. Nesne başına en fazla yaklaşık 300 üçgen. Lambalar 17:00-07:00 arası parlar. Konsola tür başına sayı yazılır.
9. **Elle eklenenler**: `data/elle-eklenen.json` (Bilim Ağacı, Devrim yazısı vb. yaklaşık konumlarla) ve okunması.
10. **CREDITS.md ve MODEL-ADAYLARI.md**.
11. **README: harita detayı bölümü**.

Kabul: Konsolda hata yok. Tabela, etiket ve nesne sayıları konsolda yazıyor. Kütüphane, Çarşı, Mediko ve Kafeterya tabelaları doğru binanın önünde. Bilgisayarda akıcı.

### B. oyun-sunucu

1. **Oyun arayüzü (imzalar)**: `js/oyun/arayuz.js`, §4 aynen. İlk commit, hemen push edilir.
2. **Şema: tablolar**: `supabase/semalar/001_tablolar.sql`. Tablolar (PLAN 4.3) + `kafeler.panel_sifresi_ozeti` + `ipucu_erisimleri`. Her tabloda RLS açık; `anon`'dan her şey `REVOKE`; `authenticated`'a yalnızca gereken `SELECT`'ler (kendi satırları için politikalarla).
3. **Şema: fonksiyonlar**: `002_fonksiyonlar.sql`. Bütün RPC'ler `security definer`, `set search_path = ''`, şema adları açık (`public.`, `extensions.`). `revoke execute ... from public, anon`; `grant execute ... to authenticated`.
4. **Storage**: `003_depolama.sql`. Özel `ipucu-fotolari` kovası. Yükleme yalnızca kendi klasörüne. Okuma yalnızca `ipucu_erisimleri`'nde süresi dolmamış izni olana; izni `ipucu_getir` 30 m içindeyken 10 dakikalığına yazar, istemci sonra `createSignedUrl` ile ister.
5. **Testler**: `supabase/test.sql`. Tek transaction ve sonunda `rollback`. `set local role authenticated` + `request.jwt.claims` ile farklı oyuncular taklit edilir. Mutlu yollar ve yasaklar: ikinci okutma, 60 m dışı, kendi hediyesi, görevli olmayan kupon kullanımı, günlük sınır, yasak bölge.
6. **Gerçek istemci**: `js/oyun/istemci.js` (supabase-js sabit sürüm, publishable anahtar, anonim oturum).
7. **Ayarlar**: `js/ayarlar.ornek.js` ve `.gitignore`.
8. **README: Supabase kurulumu** (yapıştırma sırası, Anonymous sign-in, publishable anahtar, kafe ve görevli ekleme SQL'i).

Kabul: Claude SQL'i çalıştıramaz. Dosyalar gözden geçirilir, kabulü Beyza'nın `test.sql`'i çalıştırması verir.

### C. oyun-arayuz

1. **Sahte istemci**: `js/oyun/sahte-istemci.js`. §4 arayüzü bellekte, aynı kurallarla: tek kullanımlık, 60 m, kendi hediyesi, günlük sınır, 30 m ipucu. Birden çok oyuncu taklidi için `sahte.oyuncuDegistir(id)`.
2. **Node akış testleri**: `tests/sahte-istemci.test.mjs` (`node --test`). Saklama → QR → başka oyuncu alır → cüzdan → gümüş kupon kullanımı, ve yasaklar.
3. **QR**: `js/oyun/qr.js`. Üretme (sabit sürüm CDN kütüphanesi, canvas'a); okuma (`BarcodeDetector`, yoksa jsQR). Yalnızca `MGH1:`/`MGK1:` biçimleri kabul edilir.
4. **Saklama akışı**: `js/oyun/sakla.js`. Seviye seçimi, not, kupon okutma, çek kodu, ipucu, QR'ın tek seferlik gösterimi ve yazdırma.
5. **Cüzdanım**: `js/oyun/cuzdan.js`. Bulunanlar, saklananlar, kalp, "çek çalıştı/çalışmadı", bildir.
6. **Kafe paneli**: `kafe.html` + `js/kafe/panel.js`. Görevli girişi (panel şifresi), kupon oluşturma (QR ve kullanım kodu), kupon kullanma, gün listesi.
7. **Deneme sayfası**: `oyun.html`. Konum elle girilebilir (GPS'siz test), `?sahte=1` ya da `js/ayarlar.js` yoksa sahte istemci.
8. **README: oyun arayüzü bölümü**.

Kabul: `node --test tests/` geçiyor. Tarayıcıda sahte istemciyle uçtan uca: saklama → QR → ikinci oyuncu okutur → cüzdanda görünür → (gümüş) kafe panelinde kullanılır.

### D. entegrasyon (A, B, C birleştikten sonra)

1. A, B ve C birleştirilir; `main.js`, `minecraft.html` ve README çakışmaları çözülür.
2. `js/oyun/haritada.js`: Hediye kutuları (voksel, seviye renkleri; Beyza'nın `.vox` dosyaları gelince onlar), oyuncu karakteri, sıcak-soğuk ve pusula, 30 m'de ipucu.
3. Haritaya Sakla, Cüzdanım ve Okut düğmeleri; `oyun.html`'deki akışlar haritada.
4. Gece kuralı ve yasak bölge kontrolü istemcide (sunucu da kontrol eder).
5. Konum taklidiyle test (DevTools › Sensors).

---

## 4. B ↔ C arayüzü

`js/oyun/arayuz.js`'te JSDoc ile tanımlanır. `istemci.js` ve `sahte-istemci.js` aynı biçimde dışa açar:

```js
// İkisi de: export async function istemciOlustur(ayarlar) → OyunIstemcisi
// js/oyun/arayuz.js:
export const QR_HEDIYE = 'MGH1:';   // hediye kartı:  MGH1:<32 hex = 128 bit>
export const QR_KUPON  = 'MGK1:';   // kafe kuponu:   MGK1:<32 hex>
export class OyunHatasi extends Error { constructor(kod, mesaj) }
// kod: 'AG' | 'OTURUM_YOK' | 'GECERSIZ_QR' | 'ZATEN_ALINDI' | 'KENDI_HEDIYEN' | 'UZAK'
//    | 'GUNLUK_SINIR' | 'ALTIN_SINIRI' | 'YASAK_BOLGE' | 'YETKISIZ' | 'GECERSIZ_KUPON'
//    | 'ZATEN_KULLANILDI' | 'GECERSIZ'
```

| Yöntem | Döner | Not |
|---|---|---|
| `oturumAc()` | `Oyuncu \| null` | Anonim oturum; oyuncu satırı yoksa `null` |
| `oyuncuOlustur(takmaAd)` | `Oyuncu` | `{ id, takmaAd, acilim }` |
| `hediyeSakla({ seviye, enlem, boylam, ipucuMetni, ipucuFoto?, notMetni?, kuponQr?, cekMarkasi?, cekKodu? })` | `{ hediyeId, qrKodu }` | `seviye: 'kar'\|'gumus'\|'altin'`; `ipucuFoto: Blob`; `qrKodu` yalnızca bir kez döner |
| `yakinHediyeler(enlem, boylam)` | `[{ id, seviye, gosterimEnlem, gosterimBoylam }]` | |
| `ipucuGetir(hediyeId, enlem, boylam)` | `{ metin, fotoUrl }` | 30 m dışı → `UZAK` |
| `hediyeAl(qrKodu, enlem, boylam)` | `CuzdanKaydi` | |
| `cuzdan()` | `{ bulduklarim: CuzdanKaydi[], sakladiklarim: SaklananKayit[] }` | |
| `kalpVer(hediyeId)` | `void` | |
| `cekSonucu(hediyeId, calisti)` | `void` | |
| `bildir(hediyeId)` | `void` | Uygunsuz içerik |
| `gorevliOl(kafeId, panelSifresi)` | `Kafe` | `{ id, ad }` |
| `kafem()` | `Kafe \| null` | |
| `kuponOlustur(urun)` | `{ kuponId, qrKodu, kullanimKodu }` | Görevlinin kafesi için |
| `kuponKullan(kullanimKodu)` | `{ urun, kullanildi: true }` | |
| `kafeKuponlari()` | `[{ id, urun, durum, kullanimKodu, olusturma, kullanilma }]` | |

`CuzdanKaydi`: `{ hediyeId, seviye, saklayanTakmaAd, bulunmaZamani, notMetni?, kalpSayisi?, urun?, kafeAdi?, kullanimKodu?, kuponDurumu?, cekMarkasi?, cekKodu?, cekSonucu? }`

`SaklananKayit`: `{ hediyeId, seviye, durum, saklanmaZamani, bulanTakmaAd? }`

Kurallar (iki istemcide aynı): 128 bit kod, yalnızca SHA-256 özeti saklanır; ilk okutan alır; okutma 60 m içinde; ipucu 30 m içinde; günde 3 saklama, en fazla 1 altın; kendi hediyesi alınamaz; gösterim konumu 0-15 m kaydırılır; görünme gecikmesi 30 dk (`ayarlar.demo` ile 0).

---

## 5. Riskler

| Risk | Önlem |
|---|---|
| SQL hiç çalıştırılmadan teslim ediliyor | `test.sql` tek transaction + rollback, Beyza ilk iş çalıştırır. Hatalar küçük düzeltme commit'leriyle giderilir. |
| Otomatik API erişimi kapalı → unutulan `GRANT` "permission denied" verir | Her nesne için açık `GRANT`; `test.sql` `authenticated` rolüyle çalışır, eksik izin testte yakalanır. |
| `security definer` fonksiyonlarda `search_path` açığı | `set search_path = ''` ve tam nitelikli adlar. |
| Imzalı Storage bağlantısı SQL'den üretilemez | `ipucu_erisimleri` tablosu + Storage politikası; bağlantıyı istemci üretir (§3.B-4). |
| Sahte istemci ile gerçek istemci farklı davranır | Kurallar §4'te tek yerde; ikisi de aynı `OyunHatasi` kodlarını kullanır. |
| OSM'de giriş düğümleri ve simge nesneler az | `data/elle-eklenen.json`; tabela için yürüme yoluna bakan kenar yedeği. |
| Tabela ve nesneler ağaçlarla çakışır | Ortak doluluk ızgarası, ağaçlar en son yerleşir. |
| Yazı dokuları telefonda belleği şişirir | Tek doku atlası, küçük piksel font, `NearestFilter`. |
| `main.js` / README birleştirme çakışması | A ve C yalnızca satır ekler; D'de çözülür. |
| `gh` CLI yok → PR komut satırından açılamaz | Branch'ler push edilir; PR'lar GitHub arayüzünden açılır. |
| Overpass yoğun / hata | Betik `remark` kontrol eder; başarısızsa mevcut veriyle devam edilir. |
