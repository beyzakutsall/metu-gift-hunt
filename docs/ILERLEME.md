# İlerleme raporu: 20 Kasım 2026

Kullanım sınırı 17:10 civarında doldu. A, B, C ve birleştirme tamamlandı; **D (entegrasyon kodu) yapılmadı.**

## Durum

| Branch | Durum |
|---|---|
| `uygulama-plani` | `docs/UYGULAMA.md` + bu rapor |
| `harita-detay` (A) | Bitti, push edildi |
| `oyun-sunucu` (B) | Bitti, push edildi (SQL çalıştırılmadı) |
| `oyun-arayuz` (C) | Bitti, push edildi |
| `entegrasyon` | `main`'den açıldı; A → B → C birleştirildi (`cf74077`). Tek çakışma README'deydi, iki bölüm de korundu. Birleşik hâlde `node --test "tests/*.test.mjs"` 22/22 geçti. 20:31'de tarayıcıda kontrol edildi: `minecraft.html` ve `oyun.html?sahte=1` konsol hatası olmadan açılıyor; tabela, etiket, nesne ve ağaç sayıları A'nın raporuyla aynı. |

`gh` kurulu olmadığı için hiç PR açılmadı. `main`'e dokunulmadı.

## A. harita-detay

**Yapılanlar:**
- Overpass sorgusu genişletildi; yeni `campus.json` ayrı commit.
- Bina kısa adları (`data/bina-adlari.json`, `js/bina-adlari.js`).
- Doluluk ızgarası (`js/doluluk.js`).
- Piksel yazı, voksel tabelalar, yüzen etiketler, simge nesneler.
- `CREDITS.md`, `docs/MODEL-ADAYLARI.md`, README bölümü.

Konsoldaki sayılar:

```
Tabelalar: 180 tabela (194 adlı bina), 25 yüzen etiket
Nesneler: 28 bank, 36 cop, 1017 lamba, 66 piknik, 0 cesme, 10 bisiklet, 21 heykel, 35 giris
Ağaçlar: 6728 çam, 99/400 süslü (GLB)
```

**Test edilenler (ajanın raporu):**
- Konsol temiz.
- Kütüphane, Çarşı, Mediko, Kafeterya, MM ve Rektörlük tabelaları kendi binalarının önünde; bina ya da yol hücresine giren tabela 0.
- Etiketler yakınlaşınca soluyor.

**Eksikler:**
- Kütüphane önünde bank yok, çünkü OSM'de yok.
- OSM'de lamba ve çeşme yok; lambalar yolların kenarına kendiliğinden dizildi.
- `data/elle-eklenen.json` boş.
- Ölçülen kare hızı 5-6 fps (A'sız kopya da aynı); normal bir makinede kontrol edilmeli.
- `MODEL-ADAYLARI.md` bağlantıları doğrulanmadı.


## B. oyun-sunucu (`oyun-sunucu`, 17:05 civarı bitti)

**Yapılanlar:** 10 commit.
- `js/oyun/arayuz.js`: imzalar, hata kodları ve QR biçimleri (ilk commit).
- `supabase/semalar/001_tablolar.sql`, `002_fonksiyonlar.sql`, `003_depolama.sql`, `004_yasak_bolgeler.sql` (392 kaba dikdörtgen; üretici: `supabase/yasak-bolgeler-uret.py`).
- `supabase/test.sql`.
- `js/oyun/istemci.js` (supabase-js 2.49.4, publishable anahtar, anonim oturum).
- `js/ayarlar.ornek.js`, `.gitignore` (`js/ayarlar.js`, `.env`, `.env.*`, `node_modules/`), README Supabase bölümü.

**Test edilenler:**
- `node --test tests/istemci.test.mjs` sonucu 10/10 geçti; ben de çalıştırdım. Sahte bir Supabase nesnesiyle RPC adları, parametreler, hata çevirisi ve QR ayrıştırma sınanıyor.
- İstemcideki 16 RPC çağrısı SQL imzalarıyla karşılaştırıldı; uyuşmayan yok.
- Ben ayrıca SQL'i okuyarak denetledim:
  - Her tabloda RLS açık ve `revoke all`.
  - Bütün RPC'ler `security definer` ve `set search_path = ''`.
  - RPC'lerde `anon`/`public` için `revoke execute`, `authenticated` için `grant execute`; yardımcı fonksiyonlarda herkes için `revoke`.
  - Alma işlemi atomik (`where bulan is null`).

**Test edilemeyenler:**
- **SQL hiç çalıştırılmadı.** Senin onayına rağmen `npm install --save-dev @electric-sql/pglite` komutunu Claude Code'un izin sistemi arka plan ajanında reddetti. Ajan atlatmaya çalışmadı, okuyarak denetlemeye döndü. Bu yüzden `package.json`, taklit dosyası ve SQL test betiği yok. Kabulü, `test.sql`'in Supabase'te çalıştırılması verir.
- B'nin belirttiği riskler:
  1. `test.sql`'deki `auth.users` eklemesi Supabase'in güncel şemasında zorunlu sütuna takılabilir.
  2. Fotoğraflı saklamada `hediye_sakla` içindeki `storage.objects` kontrolü.
  3. Storage politikaları ve imzalı bağlantı akışı hiç sınanmadı. `003_depolama.sql` `storage.objects` üzerinde politika oluşturuyor; SQL Editor'de yetki hatası verirse politikalar Dashboard › Storage › Policies'ten eklenmeli.

## C. oyun-arayuz (`oyun-arayuz`, 17:05'te bitti)

**Yapılanlar:**
- Sahte istemci (`js/oyun/sahte-istemci.js`).
- QR üretme ve okuma (`qr.js`).
- Saklama (`sakla.js`), bulma (`bul.js`) ve Cüzdanım (`cuzdan.js`) ekranları.
- Deneme sayfası `oyun.html`, kafe paneli `kafe.html` ve README bölümü.
- 12 commit; fonksiyon imzaları B'nin `js/oyun/arayuz.js` dosyasından alındı.

**Test edilenler:**
- `node --test "tests/*.test.mjs"` sonucu 12/12 geçti; ajandan sonra ayrıca ben de çalıştırdım.
  - Not: Yazılan komut olan `node --test tests/` Node 24'te çalışmıyor, glob'lu hâli gerekiyor.
- PLAN §6 C kabul ölçütü tarayıcıda sahte istemciyle geçti: kafe kuponu → gümüş saklama → ikinci oyuncu 100 m'den reddedildi, 40 m'den aldı → cüzdanda kullanım kodu → kafede kullanıldı → ikinci kullanım reddedildi. Konsolda hata yoktu.

**Test edilemeyenler:**
- Gerçek Supabase.
- Kamerayla QR okuma (QR'lar elle yazma alanından girildi).
- Telefon genişliği, yazdırma, GPS düğmesi.

## Kararlar

- **Branch tabanı:** A, B ve C, `main` yerine `uygulama-plani`'nden açıldı; böylece `docs/UYGULAMA.md` her akışta var. Bu dallardan `main`'e açılacak PR'lar plan commit'ini (`790d5cb`) de içerir. `uygulama-plani` önce birleştirilirse sorun olmaz.
- **Ajan bitiş hedefi 19:15:** Entegrasyon (D) için zaman kalsın diye.
- **SQL testi pglite ile:** `psql`/`docker` yok. Beyza'nın onayıyla `@electric-sql/pglite` yalnızca geliştirme bağımlılığı olarak kuruldu (`node_modules` `.gitignore`'da). Supabase'e özgü kısımlar testte taklit edilir; taklit edilenler B bölümünde. 2 denemede çalışmazsa okuyarak denetime dönülür.
- **Kupon QR biçimi `MGK1:`:** Kafe kuponunun QR'ı hediye kartından (`MGH1:`) ayrılsın diye (UYGULAMA §4).
- **Görevli girişi `gorevliOl(kafeId, panelSifresi)`:** Anonim oturumla kafe paneli; kafe satırında panel şifresinin özeti tutulur.
- **İpucu fotoğrafı:** İmzalı bağlantı SQL'den üretilemediği için `ipucu_erisimleri` tablosu + Storage politikası; bağlantıyı istemci üretir.
- **`oyun.html`:** C akışı haritaya bağlanmadan denensin diye ayrı deneme sayfası.
- **C: kamera:** Ekran açılınca otomatik açılmıyor, "Kamerayı aç" düğmesiyle açılıyor; elle kod yazma alanı her zaman var.
- **C: sahte istemcinin verisi:** localStorage'da tutuluyor, böylece `oyun.html` ve `kafe.html` aynı veriyi görüyor. Oturum sekmeye özel. Deneme kafesi: kimlik `kafe-deneme`, şifre `kafe123`.
- **C: kalp kuralı:** Bir not hediyesine yalnızca onu bulan kalp verebilir; saklayanın notları toplam 5 kalp aldıkça +3 açılım.
- **C: kullanım kodu:** Yalnızca bulanın cüzdanında görünür; kafe listesinde ve kupon oluşturulurken gösterilmez.
- **C: QR ekranı:** Saklama QR'ı bir kez gösterilir; kapatmak için "yazdırdım/kaydettim" onayı istenir.
- **C: fotoğraflar:** Göndermeden önce en uzun kenarı 800 piksele küçültülür (JPEG).
- **C: planda olmayan dosyalar:** `js/oyun/ortak.js`, `bul.js`, `deneme.js`.
- **B: erişim modeli:** Bütün okuma ve yazma RPC ile yapılıyor; tablolarda politika yok, hiçbir rol tabloya doğrudan erişemiyor. Hatalar mesaj alanında §4 kodu olarak dönüyor; dönüşler camelCase JSON.
- **B: oyun ayarları:** Tek satırlık `oyun_ayarlari` tablosunda (`gorunme_gecikmesi_dk`, `gece_gizle`). Demo bayrağı istemciden gönderilmiyor.
- **B: kurallar:** Kalp kuralı C ile aynı. Bildirim için hediyeyi bulmuş ya da ipucunu açmış olmak gerekiyor. Altında açılım yalnızca "çalıştı" yanıtında veriliyor; 3 "çalışmadı" yanıtında altın saklama hakkı kapanıyor.
- **B: yasak bölgeler:** Konut alanları ve konut/yurt binaları kaba dikdörtgenler olarak tutuluyor. Orman sunucuda kontrol edilmiyor, yalnızca istemcide.
- **B: saat:** Gece kuralı ve günlük sınır İstanbul saatine göre.
- **B: kafe:** Panel şifresi bcrypt ile saklanıyor; bir oturum tek kafeye bağlı. Kullanım kodlarında I, O, 0, 1 yok. Kafe listesi son 7 günü gösteriyor.
- **B: `kafeListesi()` eklendi** (§4'te yoktu). Panel giriş ekranı kafe kimliğini bilmiyor; sahte istemciye D'de eklenecek.
- **B: ipucu fotoğrafı:** Saklamadan önce yükleniyor; saklama başarısız olursa dosya yetim kalıyor (kabul edilen risk).
- **A: lambalar:** OSM'de lamba olmadığı için yürüme yolu kenarına en az 9 blok arayla yerleştirildi.
- **A: tabelalar:** Aynı adlı yakın binalara ikinci tabela konmadı. Elle kısa adı olmayanlarda ad otomatik kısaltılıyor ("Mühendisliği Bölümü" → "Müh.").
- **A: etiketler:** 23 önemli bina + büyük binalar (toplam 25). 90 bloktan uzakta tam görünüyor, 45-90 blok arasında soluyor.
- **A: git:** Kurallar gelmeden, henüz hiç commit yokken worktree bir kez `git reset --hard uygulama-plani` ile taşındı; kaybolan iş yok.
- **Entegrasyon:** README çakışmasında iki bölüm de korundu.

## Senin yapman gerekenler

1. **Supabase:**
   - Anonymous sign-in'i aç.
   - SQL Editor'e sırayla `supabase/semalar/001`-`004`'ü, sonra `supabase/test.sql`'i yapıştır (test başarısız olursa bir kez `rollback;`).
   - `js/ayarlar.ornek.js`'i `js/ayarlar.js` olarak kopyalayıp URL'yi ve `sb_publishable_...` anahtarını yaz.
   - Kafe eklemek için README'deki SQL'i kullan.
2. **pglite:** İstersen `npm install --save-dev --save-exact @electric-sql/pglite@0.5.15` komutunu kendin çalıştır; arka plan ajanı izin alamadı.
3. **PR'lar:** GitHub'dan `uygulama-plani`, `harita-detay`, `oyun-sunucu`, `oyun-arayuz` için PR aç (sıra A → B → C). Ya da doğrudan `entegrasyon` dalını incele.
4. **D akışı yapılmadı:** `js/oyun/haritada.js`, haritadaki düğmeler, sahte istemciye `kafeListesi()`.
5. **Elle veri:** Kütüphane önü bankları ve Bilim Ağacı konumlarını `data/elle-eklenen.json`'a gir. `MODEL-ADAYLARI.md`'deki lisansları kontrol et.
