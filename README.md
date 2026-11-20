# metu-gift-hunt



ODTÜ kampüsünde aralık ayı boyunca kullanıcıların hediye sakladığı ve bulduğu bir yılbaşı oyunu.


## Blok harita (minecraft.html)

Sayfa `data/campus.json` dosyasını okuduğu için çift tıklayarak (`file://`) açılmaz; yerel bir sunucu gerekir:

```
python -m http.server 8000
```

Ardından tarayıcıda http://localhost:8000/minecraft.html adresini açın.

Harita verisi © OpenStreetMap katkıcıları, ODbL lisansıyla. `data/campus.json` dosyasını yenilemek için: `powershell -ExecutionPolicy Bypass -File tools\veri-indir.ps1`

## Harita detayı: tabelalar, etiketler, simge nesneler

- **Tabelalar** (`js/tabelalar.js`): Adı olan her binanın önünde ahşap bir tabela durur ve binanın kısa adı piksel yazıyla okunur. Tabela, binanın OSM giriş düğümü varsa onun önüne, yoksa en yakın yürüme yoluna bakan kenarına konur. Binalara, yollara, ağaçlara ve nesnelere girmez. Yakınında aynı adlı tabela olan binalar (ör. Konukevi) tekrar tabela almaz.
- **Yüzen etiketler** (`js/etiketler.js`): Önemli ve büyük binaların adı uzaktan binanın üstünde görünür. Kamera yaklaşınca solup kaybolur; o mesafede tabelalar okunur. Üst üste binen etiketlerden önceliği düşük olan gizlenir.
- **Kısa adlar** (`data/bina-adlari.json`): Tabelada ve etikette yazan ad. Anahtar OSM öğesi (`way/<id>` ya da `relation/<id>`); `"onemli": true` olanlar uzaktan da etiketle görünür. Dosyada olmayan binalarda OSM'deki `short_name`, o da yoksa kısaltılmış `name` kullanılır ("Mühendisliği Bölümü" → "Müh." gibi).
- **Simge nesneler** (`js/nesneler.js`): Bank, çöp kutusu, piknik masası, bisiklet parkı, heykel/anıt ve bina girişleri OSM'den gelir; hepsi koddan üretilen voksel modeller. OSM'de kampüste sokak lambası olmadığı için **lambalar yürüme yollarının kenarına kendiliğinden dizilir** ve cihaz saatine göre 17:00-07:00 arası yanar.
- **Elle eklenenler** (`data/elle-eklenen.json`): OSM'de olmayan nesneler (ör. Bilim Ağacı) buraya `tur`, `enlem`, `boylam` ile eklenir; indirme betiği bu dosyaya dokunmaz. Şu an boş.
- Yerleşim sırası binalar → tabelalar → nesneler → ağaçlar; her adım öncekilerin hücrelerinden kaçınır (`js/doluluk.js`).
- Tarayıcı konsolu tabela, etiket ve tür başına nesne sayılarını yazar.

Kaynaklar ve lisanslar: [`CREDITS.md`](CREDITS.md). Hazır model adayları: [`docs/MODEL-ADAYLARI.md`](docs/MODEL-ADAYLARI.md).

## Modeller

Haritada yürüme yollarının kenarına süslü yılbaşı ağaçları dikilir; ormanlık alanlardaki sade çamlar ise koddan (`js/agaclar.js`) üretilir.

- Ağacın boyu haritada otomatik olarak yaklaşık 10 bloğa ölçeklenir, modelin kendi boyutu önemli değildir. Ağaçlar arasındaki mesafe ve yollara/binalara olan uzaklık modelin genişliğinden hesaplanır; kaç ağaç dikilebildiği tarayıcı konsolunda yazar.
- Asıl model `modeller/yilbasi-agaci.glb`. Dokusundaki **parlak sarı** pikseller ampul sayılır ve yanıp söner; kırmızı süsler ve beyaz kar sabit kalır.
- GLB yüklenemezse `modeller/yilbasi-agaci.vox` kullanılır (MagicaVoxel ile düzenlenebilir). Orada **parlak sarı** renkteki bloklar (örneğin 255, 255, 0) ışık sayılır. Yıldızın sabit kalmasını istersen onu biraz daha koyu bir sarıyla boya.

### Lisans: yilbasi-agaci.glb

"[Minecraft Christmas tree FREE](https://sketchfab.com/3d-models/minecraft-christmas-tree-free-21010e7da7134d3899e6c0d7d008593a)", [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) lisansıyla. Dosyanın kendisi değiştirilmedi; haritada yalnızca ölçeklenip tek parça halinde çizilir. Haritanın sağ alt köşesinde de kredisi yazar.

- Sketchfab sayfasında yükleyen: [CombatCraft Game](https://sketchfab.com/combatcraft)
- GLB dosyasının içindeki bilgide (`asset.extras`) yazar: [UnitedPechoraRecords](https://sketchfab.com/KV4GA)

Bu iki isim birbirini tutmadığı için ikisi de kredilendirilir.

## Oyun sunucusu (Supabase)

Şema, sunucu fonksiyonları ve testler `supabase/` klasöründe. Tablolara doğrudan erişim kapalıdır; oyun yalnızca `security definer` fonksiyonlarla (RPC) çalışır. İstemcinin arayüzü `js/oyun/arayuz.js`'te, gerçek istemci `js/oyun/istemci.js`.

### Kurulum

1. Supabase'te proje açın. Authentication › Sign In / Providers bölümünde **Anonymous sign-ins**'i açın.
2. SQL Editor'e dosyaları **bu sırayla** yapıştırıp çalıştırın:
   1. `supabase/semalar/001_tablolar.sql`
   2. `supabase/semalar/002_fonksiyonlar.sql`
   3. `supabase/semalar/003_depolama.sql`
   4. `supabase/semalar/004_yasak_bolgeler.sql`
3. `supabase/test.sql`'i çalıştırın. Her şey tek transaction içinde çalışır ve geri alınır. Hata yoksa son sorgu `TAMAM: ...` satırlarını listeler. Bir test başarısızsa `TEST BAŞARISIZ: ...` hatasıyla durur; o zaman bir kez `rollback;` çalıştırın.
4. `js/ayarlar.ornek.js`'i `js/ayarlar.js` adıyla kopyalayın. Project URL ile **publishable** anahtarı (`sb_publishable_...`) yazın. Legacy `anon` anahtarı ve secret anahtar kullanılmaz. `js/ayarlar.js` `.gitignore`'dadır.

Projede "yeni tablolara otomatik API erişimi" kapalı, "yeni tablolarda otomatik RLS" açık olduğu varsayılır. SQL dosyaları yine de bütün `GRANT`/`REVOKE`'ları ve RLS'i açıkça yazar; ayar farklı olsa da sonuç aynıdır.

### Kafe ve görevli ekleme

Panel şifresi düz metin olarak saklanmaz:

```sql
insert into public.kafeler (ad, osm_id, enlem, boylam, panel_sifresi_ozeti)
values ('Örnek Kafe', null, 39.8915, 32.7835,
        extensions.crypt('uzun-bir-panel-sifresi', extensions.gen_salt('bf')));
```

Görevli `kafe.html`'de kafeyi seçip bu şifreyi girer (`gorevli_ol`). Bir oturum aynı anda tek bir kafenin görevlisi olabilir.

### Demo ayarları

```sql
update public.oyun_ayarlari set gorunme_gecikmesi_dk = 0;  -- hediyeler hemen görünsün (varsayılan 30)
update public.oyun_ayarlari set gece_gizle = false;         -- 22:00-07:00 arası da görünsün
```

### Yasak bölgeler

Saklama kampüs sınırı dışında ve `public.yasak_bolgeler`'deki dikdörtgenlerde reddedilir. `004_yasak_bolgeler.sql`, `data/campus.json`'daki konut alanları (`landuse=residential`) ile `house`, `apartments`, `residential`, `detached` ve `dormitory` binalarının 5 m paylı sınır kutularından üretilir. Kutular kabadır: L biçimli bir alanın kutusu yanındaki boşluğu da kapsayabilir. Ormanlık alanlar sunucuda kontrol edilmez, istemci kontrol eder.

- **Veri değişince yeniden üretmek için:** `python supabase/yasak-bolgeler-uret.py data/campus.json > supabase/semalar/004_yasak_bolgeler.sql`, ardından dosyayı yeniden yapıştırın (önce tabloyu boşaltır).
- **Elle bölge eklemek için:** `insert into public.yasak_bolgeler (ad, guney, bati, kuzey, dogu) values ('Açıklama', 39.88, 32.78, 39.881, 32.781);`. Elle eklenenler yeniden üretimde silinir; kalıcı olmaları için ayrı bir SQL dosyasında tutun.

### Testler

- `node --test tests/istemci.test.mjs`: `js/oyun/istemci.js`'in fonksiyon adlarını, parametrelerini ve hata çevirisini sahte bir Supabase nesnesiyle sınar. Ağ gerekmez.
- `supabase/test.sql`: Sunucu kuralları (yukarıda). Supabase'te çalıştırılır.
