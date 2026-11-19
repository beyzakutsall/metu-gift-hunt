# ODTÜ kampüsünün OSM verisini Overpass API'den bir kez indirip data/campus.json olarak kaydeder.
# Kullanım (repo kökünden): powershell -ExecutionPolicy Bypass -File tools\veri-indir.ps1

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1'de TLS sürümünü işletim sistemi seçsin; overpass-api.de TLS 1.2 ile bağlanmıyor, 1.3 gerekiyor
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::SystemDefault

$adres     = 'https://overpass-api.de/api/interpreter'
$sorguYolu = Join-Path $PSScriptRoot 'overpass-sorgusu.txt'
$veriKlasoru = Join-Path $PSScriptRoot '..\data'
$hedefYol  = Join-Path $veriKlasoru 'campus.json'

$sorgu = Get-Content -Raw -Encoding UTF8 $sorguYolu

if (-not (Test-Path $veriKlasoru)) {
  New-Item -ItemType Directory -Path $veriKlasoru | Out-Null
}

Write-Host "Overpass'a istek gönderiliyor: $adres"
Invoke-WebRequest -Uri $adres -Method Post -Body @{ data = $sorgu } `
  -UserAgent 'metu-gift-hunt (tek seferlik veri indirme)' `
  -UseBasicParsing -OutFile $hedefYol

# Overpass hata durumunda da 200 dönüp "remark" alanına mesaj yazabilir; kontrol et
$icerik = Get-Content -Raw -Encoding UTF8 $hedefYol
if (-not $icerik.TrimStart().StartsWith('{')) {
  throw 'Yanıt JSON değil, indirme başarısız.'
}
if ($icerik -match '"remark"\s*:') {
  throw 'Overpass bir uyarı/hata döndürdü (remark alanı). Dosyayı kontrol edin.'
}

$boyutKB = [math]::Round((Get-Item $hedefYol).Length / 1KB)
Write-Host "Kaydedildi: $hedefYol ($boyutKB KB)"
