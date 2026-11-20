# Hazır 3D model adayları

Şu an haritadaki bütün simge nesneler koddan üretilen voksel modeller (`js/nesneler.js`); hiçbir
hazır model indirilmedi ve kullanılmıyor. Bu liste, ileride hazır model gerekirse bakılacak
kaynaklar içindir. **Karar Beyza'nın.** Bir model seçilirse:

- Lisansı yalnızca CC0 ya da CC BY olmalı (PLAN.md §1).
- Nesne başına en fazla ~300 üçgen (yüzlerce kez çizilecek). Mevcut voksel modeller 24-86 üçgen.
- Kaynak ve lisans `CREDITS.md`'ye, CC BY ise haritanın kredi satırına da yazılır.

Aşağıdaki lisans bilgileri genel bilgiye dayanıyor; bağlantılar ve her paketin lisans sayfası bu
liste yazılırken **açılıp doğrulanmadı**. Kullanmadan önce her modelin kendi sayfasındaki lisansa bakılmalı.

| Kaynak | Ne için uygun | Bilinen lisans | Bağlantı | Durum |
|---|---|---|---|---|
| Kenney (ör. "City Kit", "Furniture Kit", "Holiday Kit") | Bank, lamba, çöp kutusu, hediye kutusu, çeşme | CC0 | https://kenney.nl/assets | doğrulanmadı |
| Quaternius (ör. "Ultimate Nature Pack", şehir paketleri) | Ağaç, kaya, park nesneleri | CC0 | https://quaternius.com | doğrulanmadı |
| Poly Pizza | Tek tek alçak poligonlu modeller (heykel, büst, çeşme) | Modele göre CC0 ya da CC BY | https://poly.pizza | doğrulanmadı; her model ayrı kontrol edilmeli |
| Sketchfab "Downloadable" + lisans filtresi | Gerçekten gerekirse özel simgeler (ör. Bilim Ağacı'na benzer heykel) | Modele göre (CC0 / CC BY / diğer) | https://sketchfab.com/search?features=downloadable&type=models | doğrulanmadı; CC BY-NC, CC BY-ND ve "Standard" lisanslar kullanılamaz |
| OpenGameArt | Voksel/alçak poligon nesneler | Modele göre (CC0, CC BY, GPL...) | https://opengameart.org | doğrulanmadı; yalnızca CC0/CC BY olanlar |

## Hazır modele en çok ihtiyaç olabilecekler

1. **Heykel/büst**: Şu anki voksel heykel genel bir kaide ve figür. Kampüste 21 heykel ve anıt var (Fizik büstleri, Gençlik Anıtı vb.); hepsi aynı modelle çiziliyor.
2. **Çeşme**: Voksel modeli hazır ama OSM'de kampüste hiç `amenity=drinking_water` yok; `data/elle-eklenen.json`'a eklenirse çizilir.
3. **Hediye kutuları**: PLAN.md'ye göre Beyza MagicaVoxel'de yapacak; hazır modele gerek olmayabilir.
