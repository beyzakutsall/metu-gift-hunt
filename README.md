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

`modeller/yilbasi-agaci.vox` MagicaVoxel ile düzenlenebilir. Haritada yürüme yollarının kenarına bu ağaç dikilir; ormanlık alanlardaki sade çamlar ise koddan (`js/agaclar.js`) üretilir.

- Ağacın boyu haritada otomatik olarak yaklaşık 6 bloğa ölçeklenir, model kutusunun boyutu önemli değildir.
- **Parlak sarı** renkteki bloklar (örneğin 255, 255, 0) ışık sayılır ve haritada yanıp söner. Yıldızın sabit kalmasını istersen onu biraz daha koyu bir sarıyla boya.
