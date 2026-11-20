# ODTÜ Hediye Avı: Ürün ve Teknik Plan

Bu belge, kampüs haritasının detaylandırılmasını ve hediye saklama/bulma oyununu tanımlar.
Claude Code ve takım arkadaşları önce bunu okur. Kod aşamalarının ayrıntılı listesi
`docs/UYGULAMA.md` dosyasında olacak (Claude Code bu plandan üretecek).

Son güncelleme: 20 Kasım 2026

---

## 0. Özet

Aralık boyunca ODTÜ kampüsü dev bir yılbaşı takvimine dönüşür. Oyuncular kampüse hediye saklar:
saklanan yere küçük, çıkarılabilir bir **QR kartı** bırakılır. Başka bir oyuncu haritadan yeri
bulur, ipucuyla son metreleri çözer, QR'ı **uygulamanın içinden** okutur ve hediye hesabına
düşer. Hediye bir not, bir kafede bekleyen askıda kahve/tatlı ya da bir hediye çeki kodu olabilir.
Ne kadar değerli hediye saklarsan haritada o kadar çok hediyenin yeri sana açılır: **ver ki bulasın.**

**Harita ne işe yarar, ne işe yaramaz:** Telefon GPS'i açıkta 5-15 m, binaların arasında 20-30 m
sapar. Bu yüzden harita oyuncuyu hediyenin **yaklaşık 30 m yakınına** getirir; son metreleri
ipucu, sıcak-soğuk göstergesi ve QR kartının kendisi buldurur. Harita detayı bu yüzden
"blok blok gerçekçilik" değil, **yön bulmaya yarayan detay** üzerine kuruludur: bina adları ve
bank, heykel, giriş, lamba gibi simge nesneler.

### Pazar (22 Kasım) kapsamı

| Pazar'a yetişmeli (MVP) | Sonraya kalabilir |
|---|---|
| Bina adı etiketleri | Simge binalara özel cephe dokuları |
| Simge nesneler (bank, lamba, çöp kutusu, giriş, heykel) | Kar erime görseli |
| Hediye saklama + QR kartı üretme | ODTÜ e-postasıyla giriş |
| Uygulama içi QR okutma, tek kullanımlık alma | AI ile not denetimi |
| Cüzdanım ekranı | Seri (streak) bonusu |
| Kafe paneli (kupon oluşturma ve kullanma) | Bildirimler |
| Haritada hediye işaretleri, oyuncu konumu, sıcak-soğuk | |
| Vercel'e deploy, telefonda test | |

---

## 1. Kararlar

Varsayılan seçimler aşağıda. Değiştirmek istersen bu tabloyu güncelle; kod buna uyar.

| Konu | Karar | Neden |
|---|---|---|
| Giriş | Supabase **anonim oturum + takma ad** | Pazar demosunda kimse hesap açmakla uğraşmasın. Sonra `@metu.edu.tr` e-postası eklenir (çoklu hesap hilesini önler). |
| Para | **Uygulamanın içinden para geçmez** | Ödeme altyapısı ve yasal yükümlülük getirir. Kahveyi saklayan kafede öder; kafe kodu panelden oluşturur. |
| QR içeriği | `MGH1:<rastgele-kod>`, URL değil | Telefonun kamerasıyla okutulunca hiçbir siteye gitmez. Sahte QR ile oltalamayı zorlaştırır; oyuncular yalnızca uygulamanın içinden okutmayı öğrenir. |
| Kod saklama | Veritabanında yalnızca kodun **SHA-256 özeti** | Veritabanı sızsa bile QR'lar çoğaltılamaz. Kod sadece bir kez, saklayana basması için gösterilir. |
| Fiziksel kart | Çıkarılabilir küçük karton/etiket, **bulan kişi yanına alır** | Binalara ve ağaçlara yapıştırma yok; av da kart alınınca biter. |
| Sanal tur görüntüleri | `sanaltur.metu.edu.tr` **izinsiz kullanılmaz, kazınmaz** | Görüntülerin hakkı ODTÜ'nün. İzin istenir; o gelene kadar cepheler kendi çektiğimiz fotoğraflardan ya da elle tasarlanır (bkz. 2.4). |
| 3D model lisansı | Yalnızca **CC0 veya CC BY** | Her model `CREDITS.md`'ye kaynak ve lisansıyla yazılır; CC BY olanlar haritanın kredi satırına da eklenir. |
| Konum gecikmesi | Saklanan hediye haritada **30 dk sonra** görünür (demo modunda 0) | Saklayan kişi o an orada gözlenmesin. |

---

## 2. Kampüs detayı

### 2.1 Veri

`tools/overpass-sorgusu.txt` genişletilir ve `tools/veri-indir.ps1` yeniden çalıştırılır. Yeni
veri **ayrı bir commit** olur.

Eklenecek düğümler (node) ve alanlar:

| Ne | OSM etiketi |
|---|---|
| Bank | `amenity=bench` |
| Çöp kutusu | `amenity=waste_basket` |
| Sokak lambası | `highway=street_lamp` |
| Heykel, anıt, sanat eseri | `tourism=artwork`, `historic=*` |
| Bina girişi | `entrance=*` (bina çizgisinin üstündeki düğümler) |
| Piknik masası | `leisure=picnic_table` |
| Su çeşmesi | `amenity=drinking_water` |
| Bisiklet parkı | `amenity=bicycle_parking` |
| Kafe, yemek yeri | `amenity=cafe`, `amenity=fast_food`, `amenity=restaurant` (kafe ortakları için) |
| Adlandırılmış yer | `name=*` taşıyan alanlar (meydanlar, parklar) |

Not: Bina girişleri bina çizgisinin üstünde olduğu için sorguda `out body geom;` korunmalı ve
düğümlerin de çıktıya girdiğinden emin olunmalı. Kampüste OSM verisi eksik olabilir. Eksik
simge nesneler için `data/elle-eklenen.json` adında elle düzenlenen küçük bir dosya kullanılır
(ör. Bilim Ağacı, Devrim yazısı); bu dosya OSM'den gelmediği için indirme betiğiyle ezilmez.

### 2.2 Bina adları

- Mevcut veride 894 binanın **197'sinin adı var** (Kütüphane, Çarşı, Mediko, Kafeterya, bölüm binaları, yurtlar...).
- `data/bina-adlari.json`: Kampüste kullanılan kısa adlar için elle düzenlenen bir eşleme. Örnek: `"Makina Mühendisliği Bölümü A Blok" → "Makina A"`, OSM'de adı olmayan ama herkesin bildiği binalar için `osm_id → ad`. Etiketler önce bu dosyaya, sonra OSM'deki `short_name`'e, sonra `name`'e bakar.
- Etiket: bloğun üstünde yüzen, her zaman kameraya dönük, Minecraft isim etiketi tarzında yarı saydam koyu kutu ve beyaz piksel yazı (canvas ile üretilen doku, `THREE.Sprite`).
- Kalabalık olmasın diye:
  - Uzaktayken sadece büyük ve önemli binaların adı görünür (alanı büyük olanlar + `bina-adlari.json`'da `onemli: true` olanlar).
  - Yakınlaştıkça diğerleri belirir.
  - Ekranda üst üste binen etiketlerden küçük binanınki gizlenir.
- Kabul ölçütü: Kütüphane, Çarşı, Mediko, Kafeterya ve en az 5 bölüm binasının etiketi doğru yerde; telefonda etiketler yüzünden kare hızı belirgin düşmüyor.

### 2.3 Simge nesneler

- Her tür için tek bir model, `InstancedMesh` ile yüzlerce kez çizilir (ağaçlardaki yapı).
- Model kaynağı, öncelik sırasıyla:
  1. **Kodla üretilen voksel model** (sade çam gibi): bank, çöp kutusu, lamba, piknik masası basit şekiller. Lisans derdi yok, stil tutarlı, çok hafif.
  2. **CC0 hazır modeller** (ör. Kenney'nin oyun varlıkları): kodla yapması zor olan heykel ve çeşme gibi şeyler için.
  3. **CC BY modeller** (Sketchfab, Poly Pizza): sadece gerçekten gerekirse; kredi zorunlu.
- Performans sınırı: Tek nesne başına **en fazla ~300 üçgen** (lamba ve bank yüzlerce kez çizilecek). Bulunan model daha ağırsa kullanılmaz ya da sadeleştirilir.
- Ölçek: 1 blok ≈ 3 m. Bank ve çöp kutusu bir bloktan küçük, lamba yaklaşık 2 blok. Nesneler binaların, ağaçların ve birbirlerinin içine girmez.
- Bina girişleri: bina duvarında koyu bir kapı boşluğu ve önünde açık renkli bir eşik bloğu. "Kütüphane girişi" haritada gözle seçilebilmeli.
- Lambalar geceleri (cihaz saati 17:00-07:00 arası) sıcak sarı ışık yayar; yılbaşı ağaçlarındaki ışıkla aynı shader yaklaşımı.
- Her kaynak ve lisans `CREDITS.md`'ye yazılır.
- Kabul ölçütü: Kütüphane girişinin önündeki banklar ve lambalar haritada seçilebiliyor; konsol, her türden kaç nesne çizildiğini yazıyor.

### 2.4 Simge binaların cepheleri (Pazar'dan sonra)

Amaç: Kütüphane, Devrim Stadı, MM, Rektörlük, Çarşı, Kafeterya gibi 5-6 binayı gerçek cephesine
benzetmek.

- `sanaltur.metu.edu.tr` görüntüleri ODTÜ'ye ait. **Kazınmaz, izinsiz dokuya çevrilmez.** Beyza, ODTÜ Halkla İlişkiler'e bir e-postayla izin ister; bu, ileride resmî bir iş birliğine de dönüşebilir.
- İzin gelene kadar: Beyza'nın kendi çektiği fotoğraflar 16x16 piksel stile indirgenir, ya da cephe MagicaVoxel'de elle modellenip `.vox` olarak eklenir. Sanal tur yalnızca göz referansı olarak açılıp bakılabilir.
- Teknik: `data/simge-binalar.json` dosyasında `osm_id → model ya da doku` eşlemesi tutulur; eşleşen bina genel blok yerine özel modeliyle çizilir.

---

## 3. Oyun mekaniği

### 3.1 Hediye seviyeleri

| Seviye | Hediye | Nasıl doğrulanır | Haritada açtığı | Ne zaman |
|---|---|---|---|---|
| ❄️ Kar tanesi | Not, çizim ya da fotoğraf (dijital); istenirse karta elle yazılmış not | Doğrulama gerekmez | +1 hediye | Saklayınca hemen |
| 🥈 Gümüş | Bir kafede askıda kahve/tatlı | Kuponu **kafe** panelden oluşturur, yani hediye gerçekten var | +3 hediye | Saklayınca hemen |
| 🥇 Altın | Hediye çeki kodu | **Bulan kişi** "kod çalıştı" der | +10 hediye | Bulan onaylayınca |

Ek kurallar:
- **Başlangıç:** Her oyuncu, kendine en yakın 3 hediyeyi görür. Saklayarak açtıkları bunun üstüne eklenir.
- **Emek de değerli:** Bir not hediyesi bulanlardan 5 kalp alırsa saklayanına +3 açılır. Para harcamadan da ilerlenebilir.
- **Sınırlar:** Günde en fazla 3 saklama, bunlardan en fazla 1 altın. Kendi sakladığını alamazsın.
- **Sahte altın:** Bulan kişi "kod çalışmadı" derse saklayanın o hediyeden kazandığı açılım geri alınır. 3 şikâyette altın saklama hakkı kapanır.

"Haritada açılan" ne demek: Oyuncu, henüz bulunmamış hediyelerden **kendisine en yakın N tanesinin** yaklaşık yerini görür. N = 3 + kazandığı açılım. Haritada her hediye, gerçek yerinden **rastgele 0-15 m kaydırılmış** bir noktada gösterilir; tam yeri ipucu ve QR söyler.

### 3.2 Saklama akışı

1. Oyuncu haritada **Sakla**'ya basar. Uygulama GPS konumunu alır ve kampüs sınırı içinde, izin verilen bir yerde olduğunu kontrol eder (bkz. 3.6).
2. Seviyeyi seçer:
   - **Kar tanesi:** Not yazar ve/veya fotoğraf/çizim ekler.
   - **Gümüş:** Kafeden aldığı **kupon QR'ını** okutur. Bu QR'ı kafe görevlisi kasada oluşturmuştur ve "saklanmaya hazır askıda ürün" demektir.
   - **Altın:** Çek kodunu ve markasını girer. Kod sadece bulan kişiye gösterilir.
3. **İpucu** ekler: zorunlu kısa bir metin ("Kütüphane girişinin solundaki bankın altı") ve isteğe bağlı bir fotoğraf.
4. Uygulama **saklama QR'ını** üretir ve tek seferlik gösterir: ekrandan yazdır, PDF indir ya da QR'ı telefonda göster ve bir arkadaşın telefonundan okut. (Pazar demosu: önceden basılmış kartlar.)
5. Oyuncu kartı saklar. Hediye 30 dk sonra başkalarının haritasında görünmeye başlar.

### 3.3 Bulma akışı

1. **Harita:** Açık hediyeler kendi seviye renklerinde küçük voksel hediye kutuları olarak görünür (Beyza'nın MagicaVoxel modelleri: kar tanesi beyaz-mavi, gümüş, altın). Oyuncunun konumu haritada bir karakterle gösterilir.
2. **Yaklaşma:** Hediyeye 30 m'den yakınken **sıcak-soğuk** göstergesi açılır: mesafe (yaklaşık), "ısınıyorsun / soğuyorsun" ve pusula oku. Pusula için cihazın yön sensörü kullanılır; iOS'ta izin bir düğmeyle istenir.
3. **İpucu:** 30 m içinde saklayanın ipucu metni ve fotoğrafı açılır. Konum sunucuda da kontrol edilir; fotoğraf yalnızca bu koşulda geçici bir bağlantıyla verilir.
4. **QR:** Oyuncu kartı bulur ve **uygulamanın içindeki okuyucuyla** okutur. Sunucu kodu doğrular, hediyeyi tek kullanımlık olarak bu oyuncuya geçirir (ilk okutan alır).
5. **Ödül ekranı:** Konfeti; hediye **Cüzdanım**'a düşer. Not hediyelerine kalp verilebilir. Altın hediyelerde "kod çalıştı / çalışmadı" sorulur.
6. Kart oyuncuda kalır; hediye haritadan kalkar.

### 3.4 Kafe akışı (gümüş seviye)

- **Kafe görevlisi** `kafe.html` paneline girer (Pazar'da: panel şifresiyle bağlanan bir görevli hesabı).
- **Askıda ürün oluşturma:** Müşteri kasada ödemeyi yapar, görevli panelde ürünü seçer ("Filtre kahve"). Panel bir **kupon QR'ı** gösterir; müşteri bunu kendi uygulamasıyla okutup saklama akışına başlar (3.2, gümüş).
- **Kupon kullanma:** Hediyeyi bulan kişi kafeye gelir ve Cüzdanım'daki 6 karakterlik **kullanım kodunu** gösterir. Görevli kodu panele yazar; panel ürünü ve geçerliliğini gösterir; **Kullanıldı** ile kapatılır. Kod ikinci kez kullanılamaz.
- Kafe, kendi oluşturduğu ve kullandığı kuponların listesini görür (gün sonu hesabı için).

### 3.5 Güvenlik ve hile önlemleri

| Risk | Önlem |
|---|---|
| QR fotoğraflanıp paylaşılır | Her kod tek kullanımlık; ilk okutan alır. Okutma anında GPS, hediyenin 60 m içinde olmalı (kandırılabilir ama caydırır). |
| Kod tahmin edilir | 128 bit rastgele kod; veritabanında yalnızca özeti. |
| Sahte QR yapıştırılır (oltalama) | QR bir URL değil; uygulama yalnızca `MGH1:` biçimini kabul eder. Oyunculara "sadece uygulamanın içinden okut" denir. |
| Aynı anda iki kişi okutur | Alma işlemi veritabanında tek bir atomik güncellemeyle yapılır (`... where bulan is null`). |
| Sahte gümüş | Gümüş kupon yalnızca kafe panelinden doğabilir. |
| Sahte altın | Açılım, bulan onaylayınca verilir; şikâyetler sayılır (3.1). |
| Çok hesap açıp kendi hediyesini bulma | Pazar: kabul edilen risk. Sonra: `@metu.edu.tr` e-postası. |
| Uygunsuz not | "Bildir" düğmesi; 2 bildirimde hediye gizlenir. Basit kelime filtresi. AI denetimi sonra. |
| Sunucuya doğrudan istek | Tablolarda RLS açık; yazma işlemleri yalnızca sunucu fonksiyonlarıyla (RPC). |

### 3.6 Gizlilik ve fiziksel güvenlik

- **Saklama yasak bölgeleri:** Ormanlık alan (`ZEMIN.ORMAN`), lojman ve konut alanları (`landuse=residential`, `building=house|apartments|residential|detached`), yurt binalarının içi, kampüs sınırı dışı. Uygulama bu bölgelerde **Sakla** düğmesini kapatır; sunucu da aynı kontrolü yapar (kaba bir bölge listesiyle).
- **Gece:** 22:00-07:00 arası haritada hediye gösterilmez ("Hediyeler sabah görünecek").
- **Saklayanın konumu:** Hediyeler 30 dk gecikmeyle ve kaydırılmış konumla görünür; kimin sakladığı bulana kadar gösterilmez (bulan, takma adı görür).
- **Konum verisi:** Oyuncunun sürekli konumu sunucuya **kaydedilmez**; sadece saklama ve alma anındaki konum o işlemde kullanılır.
- **Kart:** Bina, ağaç ve tabelalara yapıştırılmaz. Bulunmazsa saklayan 7 gün sonra kartı toplaması için hatırlatma alır (sonra).

---

## 4. Teknik mimari

### 4.1 Genel yapı

- **Ön yüz:** Mevcut yapı (düz HTML + ES modülleri + import map'teki three@0.170.0). Build aracı yok.
- **Sunucu:** Supabase (Postgres + RLS + RPC fonksiyonları + Storage). Kütüphane: `@supabase/supabase-js` import map'e sabit sürümle eklenir.
- **QR üretme:** Sabit sürümlü bir ESM kütüphanesi (ör. `qrcode`), CDN'den.
- **QR okuma:** Varsa tarayıcının `BarcodeDetector`'ı; yoksa sabit sürümlü `jsQR` + kamera görüntüsü.
- **Yayın:** Vercel (statik). Telefonda kamera, GPS ve pusula yalnızca HTTPS'te çalışır, bu yüzden testler deploy edilmiş adreste yapılır.
- **Gizli anahtarlar:** Supabase `anon` anahtarı ön yüzde durabilir (RLS ile korunur) ve `js/ayarlar.js`'e yazılır. `service_role` anahtarı **hiçbir zaman** repoya, ön yüze ya da sohbete girmez.

### 4.2 Dosya yapısı ve sahiplik

Paralel çalışırken çakışmayı azaltmak için her iş akışı kendi dosyalarına sahiptir. `js/main.js`
ve `minecraft.html` yalnızca birer satır import/eleman eklemek için değiştirilir; orada çıkan küçük
çakışmalar entegrasyonda çözülür.

```
data/bina-adlari.json        2.2   (harita-detay)
data/elle-eklenen.json       2.1   (harita-detay)
js/etiketler.js              2.2   (harita-detay)
js/nesneler.js               2.3   (harita-detay)
modeller/nesneler/*          2.3   (harita-detay)
CREDITS.md                   2.3   (harita-detay)

supabase/semalar/001_*.sql   4.3   (oyun-sunucu)
supabase/test.sql            4.3   (oyun-sunucu)
js/oyun/istemci.js           4.3   (oyun-sunucu)   Supabase bağlantısı + RPC sarmalayıcıları
js/ayarlar.ornek.js          4.3   (oyun-sunucu)

js/oyun/sakla.js             3.2   (oyun-arayuz)
js/oyun/qr.js                3.2-3.3 (oyun-arayuz)  üretme + okuma
js/oyun/cuzdan.js            3.3   (oyun-arayuz)
js/oyun/arayuz.css           (oyun-arayuz)
kafe.html, js/kafe/*.js      3.4   (oyun-arayuz)

js/oyun/haritada.js          3.3   (entegrasyon)   hediye kutuları, oyuncu karakteri, sıcak-soğuk
modeller/hediye-*.vox        3.3   (Beyza, MagicaVoxel)
```

### 4.3 Veritabanı (Supabase)

Tablolar (hepsinde RLS açık):

- `oyuncular`: `id` (= auth.uid), `takma_ad`, `acilim` (kazanılmış ek hediye görüş sayısı), `olusturma`
- `kafeler`: `id`, `ad`, `osm_id`, `enlem`, `boylam`
- `kafe_gorevlileri`: `oyuncu_id`, `kafe_id`
- `kuponlar`: `id`, `kafe_id`, `urun`, `kod_ozeti`, `kullanim_kodu` (6 karakter), `durum` (`hazir` → `saklandi` → `bulundu` → `kullanildi`), zamanlar
- `hediyeler`: `id`, `saklayan`, `seviye` (`kar` | `gumus` | `altin`), `qr_ozeti`, `enlem`, `boylam`, `gosterim_enlem`, `gosterim_boylam` (kaydırılmış), `ipucu_metni`, `ipucu_foto` (Storage yolu), `not_metni`, `kupon_id`, `cek_markasi`, `cek_kodu`, `durum` (`saklandi` | `bulundu` | `gizlendi`), `bulan`, `saklanma_zamani`, `gorunme_zamani`, `bulunma_zamani`
- `kalpler`: `hediye_id`, `oyuncu_id`
- `sikayetler`: `hediye_id`, `oyuncu_id`, `tur` (`uygunsuz` | `cek_calismadi`), `zaman`

Okuma kuralları:
- `hediyeler` tablosu doğrudan okunamaz. Harita, `yakin_hediyeler(enlem, boylam)` fonksiyonundan yalnızca **görünür, bulunmamış, gece olmayan** ve oyuncunun açılım sayısı kadar hediyenin `id`, `seviye`, `gosterim_enlem/boylam` alanlarını alır.
- Oyuncu kendi sakladıklarını ve bulduklarını tam görebilir; `cek_kodu` yalnızca bulana görünür.

Sunucu fonksiyonları (RPC, `security definer`, her biri kendi kontrollerini yapar):

| Fonksiyon | Ne yapar |
|---|---|
| `oyuncu_olustur(takma_ad)` | Anonim oturum için oyuncu satırı |
| `hediye_sakla(...)` | Bölge ve günlük sınır kontrolü; rastgele QR kodu üretir, özetini saklar, **kodu bir kez döndürür**; seviyeye göre açılım verir |
| `yakin_hediyeler(enlem, boylam)` | Yukarıdaki okuma kuralı |
| `ipucu_getir(hediye_id, enlem, boylam)` | 30 m içindeyse ipucu metni ve fotoğrafın geçici bağlantısı |
| `hediye_al(qr_kodu, enlem, boylam)` | Özet eşleşmesi, 60 m kontrolü, kendi hediyesi değil; atomik olarak `bulan` atanır; cüzdan bilgisi döner |
| `kalp_ver(hediye_id)`, `cek_sonucu(hediye_id, calisti)` | Açılım ödülleri ve geri alma |
| `kupon_olustur(kafe_id, urun)` | Sadece görevli; kupon QR kodu ve kullanım kodu üretir |
| `kupon_kullan(kullanim_kodu)` | Sadece o kafenin görevlisi; `bulundu` → `kullanildi` |

`supabase/test.sql` her fonksiyonun mutlu yolunu ve en az bir yasak durumunu dener (ikinci okutma
reddedilir, 60 m dışı reddedilir, kendi hediyesini alma reddedilir, görevli olmayan kupon kullanamaz).

Kurulum: Beyza Supabase'te proje açar, `supabase/semalar/*.sql` dosyalarını sırayla SQL Editor'e
yapıştırır, Anonymous sign-in'i açar ve proje adresi ile `anon` anahtarını `js/ayarlar.js`'e yazar.

---

## 5. İş akışları ve sıralama

```
                ┌─ A. harita-detay ──────────────┐
main ──────────┤                                 ├─► D. entegrasyon ─► E. deploy + telefon testi
                ├─ B. oyun-sunucu ──► C. oyun-arayuz ┘
```

| Akış | Branch | Ne içerir | Bağımlılık |
|---|---|---|---|
| A | `harita-detay` | 2.1 veri, 2.2 bina adları, 2.3 simge nesneler | Yok |
| B | `oyun-sunucu` | 4.3 şema, RPC'ler, testler, `js/oyun/istemci.js` | Yok |
| C | `oyun-arayuz` | 3.2 saklama, QR üretme/okuma, cüzdan, kafe paneli | B'nin fonksiyon imzaları (B önce imzaları commit'ler; C o zamana kadar sahte istemciyle çalışır) |
| D | `entegrasyon` | Haritada hediye kutuları, oyuncu karakteri, sıcak-soğuk, ipucu, düğmeler | A, B, C merge edilmiş |
| E | `deploy` | Vercel, telefonda uçtan uca test, demo modu | D |

Kurallar:
- `main`'e doğrudan push yok. Her akış kendi branch'inde, mümkünse kendi `git worktree`'sinde çalışır.
- Her çalışan adım ayrı commit; mesajlar Türkçe ve ne yapıldığını söyler.
- Her akış bitince PR açılır; merge sırası **A → B → C → D → E**.
- Veri dosyası (`data/campus.json`) değişikliği her zaman ayrı commit.
- Gizli anahtar commit'lenmez; `.gitignore` buna göre güncellenir.

---

## 6. Test planı

Her akış kendi kabul ölçütlerini sağlamadan PR açılmaz.

| Akış | Kabul ölçütü |
|---|---|
| A | Konsolda hata yok. Bina adları ve nesne sayıları konsolda yazıyor. Kütüphane, Çarşı, Mediko, Kafeterya etiketleri doğru yerde. Bilgisayarda akıcı. |
| B | `supabase/test.sql` hatasız çalışıyor; ikinci okutma, 60 m dışı ve kendi hediyesini alma reddediliyor. |
| C | Sahte istemciyle ve gerçek sunucuyla: saklama → QR üretme → başka bir oturumdan okutma → cüzdanda görünme → (gümüş) kafe panelinde kullanma. |
| D | Bilgisayarda konum taklidiyle (tarayıcı geliştirici araçlarındaki Sensors): hediye kutuları görünüyor, 30 m içinde sıcak-soğuk ve ipucu açılıyor. |
| E | Deploy edilmiş adreste, iki ayrı telefonla uçtan uca: biri saklar, diğeri bulur. iPhone'da kamera ve pusula izni çalışıyor. |

---

## 7. Beyza'nın yapması gerekenler (kod dışı)

| Ne | Ne zaman |
|---|---|
| Egg Club kurallarını kontrol et: proje o gün sıfırdan mı yapılmalı? Öyleyse bu repo prototip olur, Pazar günü takımla yeniden kurulur. | Bugün |
| Supabase'te proje aç, Anonymous sign-in'i aç, `anon` anahtarını `js/ayarlar.js`'e yaz | B başlamadan |
| Vercel hesabı aç, GitHub reposunu bağla | E'den önce |
| MagicaVoxel'de 3 hediye kutusu modeli (kar tanesi, gümüş, altın), her biri ~10x10x10 | D'den önce |
| Kampüste bir kafeyle konuş: "Pazar demosunda ilk ortağımız olur musunuz?" | Cumartesi |
| ODTÜ Halkla İlişkiler'e sanal tur görüntüleri için izin e-postası | Pazar'dan sonra da olur |
| Demo için 5-10 QR kartı yazdır, demo sabahı salona sakla | Pazar sabahı |

---

## 8. Sonraya kalanlar

- Kar erime görseli (haritada kar örtüsü, açılan hediyelerin çevresinde erir)
- `@metu.edu.tr` ile giriş
- Seri bonusu, liderlik tablosu
- Simge bina cepheleri (2.4)
- AI ile not denetimi
- Bulunmayan kartlar için toplama hatırlatması
- Kafeler için basit raporlar
