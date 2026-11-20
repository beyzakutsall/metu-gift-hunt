# metu-gift-hunt



ODTÜ kampüsünde aralık ayı boyunca kullanıcıların hediye sakladığı ve bulduğu bir yılbaşı oyunu.


## Blok harita (minecraft.html)

Sayfa `data/campus.json` dosyasını okuduğu için çift tıklayarak (`file://`) açılmaz; yerel bir sunucu gerekir:

```
python -m http.server 8000
```

Ardından tarayıcıda http://localhost:8000/minecraft.html adresini açın.

Harita verisi © OpenStreetMap katkıcıları, ODbL lisansıyla. `data/campus.json` dosyasını yenilemek için: `powershell -ExecutionPolicy Bypass -File tools\veri-indir.ps1`

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

## Oyun arayüzü (oyun.html, kafe.html)

Hediye saklama, kart okutma, cüzdan ve kafe paneli ekranları. Haritaya bağlanmadan önce iki deneme sayfasında çalışır (yerel sunucuyla, yukarıdaki gibi):

- http://localhost:8000/oyun.html: oyuncu ekranları. Konum elle girilir ya da "GPS'ten al" ile alınır; hazır konumlar arasında Kütüphane önü ve 40/100 m uzağı var.
- http://localhost:8000/kafe.html: kafe görevlisi paneli (askıda ürün kuponu oluşturma ve kullanma).

**Sahte istemci:** `js/ayarlar.js` yoksa ya da adrese `?sahte=1` eklenirse sayfalar Supabase yerine `js/oyun/sahte-istemci.js` ile çalışır. Kurallar gerçek sunucuyla aynıdır (tek kullanımlık QR, 60 m, 30 m ipucu, günlük sınırlar). Veri tarayıcının localStorage'ında tutulur, böylece `oyun.html` ve `kafe.html` aynı veriyi görür; her sekme ayrı bir oyuncudur. "Başka oyuncu ol" aynı sekmede oyuncu değiştirir, "Sahte veriyi sıfırla" her şeyi siler. Sahte modda deneme kafesi: kimlik `kafe-deneme`, panel şifresi `kafe123`. Sahte modda hediyeler 30 dakika beklemeden görünür.

**Uçtan uca deneme:** Bir sekmede kafe panelinden kupon QR'ı oluştur, diğer sekmede "Sakla › Gümüş" ile o kuponu okut ve sakla, "Başka oyuncu ol" ile ikinci oyuncu olup "Kart okut"ta saklama QR'ını okut, cüzdandaki kullanım kodunu kafe panelinde "Kupon kullan"a yaz. Kamera yoksa QR metni okuyucunun altındaki alana elle yazılabilir.

**QR:** Hediye kartları `MGH1:<32 hex>`, kafe kuponları `MGK1:<32 hex>`; uygulama başka QR'ları (URL'ler dahil) kabul etmez. QR üretmek için `qrcode@1.5.4`, kamerada `BarcodeDetector` yoksa okumak için `jsqr@1.4.0` jsDelivr'dan ilk kullanımda yüklenir. Kamera telefonda yalnızca HTTPS'te açılır.

**Testler:** Sahte istemcinin akış testleri Node ile çalışır:

```
node --test "tests/*.test.mjs"
```
