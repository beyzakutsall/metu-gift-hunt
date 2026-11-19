# metu-gift-hunt



ODTÜ kampüsünde aralık ayı boyunca kullanıcıların hediye sakladığı ve bulduğu bir yılbaşı oyunu.


## Blok harita (minecraft.html)

Sayfa `data/campus.json` dosyasını okuduğu için çift tıklayarak (`file://`) açılmaz; yerel bir sunucu gerekir:

```
python -m http.server 8000
```

Ardından tarayıcıda http://localhost:8000/minecraft.html adresini açın.

Harita verisi © OpenStreetMap katkıcıları, ODbL lisansıyla. `data/campus.json` dosyasını yenilemek için: `powershell -ExecutionPolicy Bypass -File tools\veri-indir.ps1`
