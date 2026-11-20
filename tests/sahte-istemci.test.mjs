// Sahte istemci akış testleri: node --test tests/
// Birden çok oyuncu, ortak bir sahte veritabanına bağlanan ayrı istemcilerle taklit edilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istemciOlustur, bosVeri, DENEME_KAFESI } from '../js/oyun/sahte-istemci.js';
import { KURALLAR, qrAyristir } from '../js/oyun/arayuz.js';

// Kütüphane önü ve ondan ~100 m doğusu
const KUTUPHANE = { enlem: 39.8915, boylam: 32.7835 };
const UZAK = { enlem: 39.8915, boylam: 32.7847 };
const OGLEN = () => new Date(2026, 11, 5, 13, 0);

async function oyuncu(veri, takmaAd, ek = {}) {
  const i = await istemciOlustur({ veri, demo: true, saat: OGLEN, ...ek });
  await i.oturumAc();
  await i.oyuncuOlustur(takmaAd);
  return i;
}

const hataKodu = (kod) => (h) => { assert.equal(h.kod, kod); return true; };

function karHediyesi(ek = {}) {
  return { seviye: 'kar', ...KUTUPHANE, ipucuMetni: 'Girişin solundaki bankın altı', notMetni: 'Mutlu yıllar!', ...ek };
}

test('kar: saklama → QR → başka oyuncu alır → cüzdanda görünür', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  const can = await oyuncu(veri, 'Can');

  const { hediyeId, qrKodu } = await ayse.hediyeSakla(karHediyesi());
  assert.deepEqual(qrAyristir(qrKodu)?.tur, 'hediye');
  assert.equal((await ayse.oturumAc()).acilim, KURALLAR.ACILIM.kar);

  // Kod veritabanında düz metin olarak durmuyor
  assert.ok(!JSON.stringify(veri).includes(qrKodu.slice(5)));

  const yakin = await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(yakin.length, 1);
  assert.equal(yakin[0].id, hediyeId);

  const ipucu = await can.ipucuGetir(hediyeId, KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(ipucu.metin, 'Girişin solundaki bankın altı');

  const kayit = await can.hediyeAl(qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(kayit.notMetni, 'Mutlu yıllar!');
  assert.equal(kayit.saklayanTakmaAd, 'Ayşe');

  const cuzdan = await can.cuzdan();
  assert.equal(cuzdan.bulduklarim.length, 1);
  assert.equal(cuzdan.bulduklarim[0].hediyeId, hediyeId);

  const sakladiklarim = (await ayse.cuzdan()).sakladiklarim;
  assert.equal(sakladiklarim[0].durum, 'bulundu');
  assert.equal(sakladiklarim[0].bulanTakmaAd, 'Can');

  // Bulunan hediye haritadan kalkar
  assert.equal((await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam)).length, 0);
});

test('yasaklar: ikinci okutma, 60 m dışı, kendi hediyesi, geçersiz QR', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  const can = await oyuncu(veri, 'Can');
  const ece = await oyuncu(veri, 'Ece');
  const { qrKodu } = await ayse.hediyeSakla(karHediyesi());

  await assert.rejects(ayse.hediyeAl(qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam), hataKodu('KENDI_HEDIYEN'));
  await assert.rejects(can.hediyeAl(qrKodu, UZAK.enlem, UZAK.boylam), hataKodu('UZAK'));
  await assert.rejects(can.hediyeAl('https://ornek.com/MGH1', KUTUPHANE.enlem, KUTUPHANE.boylam), hataKodu('GECERSIZ_QR'));
  await assert.rejects(can.hediyeAl('MGH1:' + '0'.repeat(32), KUTUPHANE.enlem, KUTUPHANE.boylam), hataKodu('GECERSIZ_QR'));

  await can.hediyeAl(qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam);
  await assert.rejects(ece.hediyeAl(qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam), hataKodu('ZATEN_ALINDI'));
});

test('ipucu yalnızca 30 m içinde', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  const can = await oyuncu(veri, 'Can');
  const { hediyeId } = await ayse.hediyeSakla(karHediyesi());
  await assert.rejects(can.ipucuGetir(hediyeId, UZAK.enlem, UZAK.boylam), hataKodu('UZAK'));
});

test('günlük sınır: 3 saklama, en fazla 1 altın', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  const altin = { seviye: 'altin', ...KUTUPHANE, ipucuMetni: 'Ağacın dibi', cekMarkasi: 'Kitapçı', cekKodu: 'ABC-123' };
  await ayse.hediyeSakla(altin);
  await assert.rejects(ayse.hediyeSakla(altin), hataKodu('ALTIN_SINIRI'));
  await ayse.hediyeSakla(karHediyesi());
  await ayse.hediyeSakla(karHediyesi());
  await assert.rejects(ayse.hediyeSakla(karHediyesi()), hataKodu('GUNLUK_SINIR'));
});

test('kampüs dışı ve eksik bilgi reddedilir', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  await assert.rejects(ayse.hediyeSakla(karHediyesi({ enlem: 39.95 })), hataKodu('YASAK_BOLGE'));
  await assert.rejects(ayse.hediyeSakla(karHediyesi({ ipucuMetni: '  ' })), hataKodu('GECERSIZ'));
  await assert.rejects(ayse.hediyeSakla(karHediyesi({ notMetni: '' })), hataKodu('GECERSIZ'));
});

test('oturum olmadan işlem yapılamaz', async () => {
  const i = await istemciOlustur({ veri: bosVeri(), demo: true, saat: OGLEN });
  assert.equal(await i.oturumAc(), null);
  await assert.rejects(i.hediyeSakla(karHediyesi()), hataKodu('OTURUM_YOK'));
});

test('görünme gecikmesi ve gece kuralı', async () => {
  const veri = bosVeri();
  let simdi = OGLEN();
  const saat = () => simdi;
  const ayse = await oyuncu(veri, 'Ayşe', { demo: false, saat });
  const can = await oyuncu(veri, 'Can', { demo: false, saat });
  await ayse.hediyeSakla(karHediyesi());
  assert.equal((await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam)).length, 0);
  simdi = new Date(simdi.getTime() + (KURALLAR.GORUNME_GECIKMESI_DK + 1) * 60000);
  assert.equal((await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam)).length, 1);
  simdi = new Date(2026, 11, 5, 23, 0);
  assert.equal((await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam)).length, 0);
});

test('görüş sayısı: en yakın 3 + açılım; gösterim konumu en fazla 15 m kayık', async () => {
  const veri = bosVeri();
  const can = await oyuncu(veri, 'Can');
  for (let k = 0; k < 3; k++) {
    const s = await oyuncu(veri, 'Saklayan' + k);
    for (let n = 0; n < 2; n++) await s.hediyeSakla(karHediyesi({ boylam: KUTUPHANE.boylam + (k * 2 + n) * 0.0001 }));
  }
  const yakin = await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(yakin.length, KURALLAR.BASLANGIC_GORUS);
  const { mesafe } = await import('../js/oyun/sahte-istemci.js');
  for (const y of yakin) {
    const h = veri.hediyeler[y.id];
    assert.ok(mesafe(h.enlem, h.boylam, y.gosterimEnlem, y.gosterimBoylam) <= KURALLAR.KAYDIRMA_EN_FAZLA_M + 0.01);
  }
  // Can bir hediye saklayınca bir tane daha görür
  await can.hediyeSakla(karHediyesi({ enlem: KUTUPHANE.enlem + 0.001 }));
  assert.equal((await can.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam)).length, KURALLAR.BASLANGIC_GORUS + KURALLAR.ACILIM.kar);
});

test('gümüş: kafe kupon oluşturur → saklanır → bulunur → kafede kullanılır', async () => {
  const veri = bosVeri();
  const gorevli = await oyuncu(veri, 'Görevli');
  const ayse = await oyuncu(veri, 'Ayşe');
  const can = await oyuncu(veri, 'Can');

  await assert.rejects(gorevli.gorevliOl(DENEME_KAFESI.id, 'yanlis'), hataKodu('YETKISIZ'));
  const kafe = await gorevli.gorevliOl(DENEME_KAFESI.id, DENEME_KAFESI.panelSifresi);
  assert.equal(kafe.ad, DENEME_KAFESI.ad);
  assert.deepEqual(await gorevli.kafem(), kafe);

  const kupon = await gorevli.kuponOlustur('Filtre kahve');
  assert.equal(qrAyristir(kupon.qrKodu)?.tur, 'kupon');
  assert.match(kupon.kullanimKodu, /^[A-Z0-9]{6}$/);

  const { qrKodu } = await ayse.hediyeSakla({ seviye: 'gumus', ...KUTUPHANE, ipucuMetni: 'Lambanın arkası', kuponQr: kupon.qrKodu });
  assert.equal((await ayse.oturumAc()).acilim, KURALLAR.ACILIM.gumus);
  // Aynı kupon ikinci kez saklanamaz
  await assert.rejects(ayse.hediyeSakla({ seviye: 'gumus', ...KUTUPHANE, ipucuMetni: 'x', kuponQr: kupon.qrKodu }), hataKodu('GECERSIZ_KUPON'));

  // Bulunmadan kullanılamaz
  await assert.rejects(gorevli.kuponKullan(kupon.kullanimKodu), hataKodu('GECERSIZ_KUPON'));

  const kayit = await can.hediyeAl(qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(kayit.urun, 'Filtre kahve');
  assert.equal(kayit.kafeAdi, DENEME_KAFESI.ad);
  assert.equal(kayit.kullanimKodu, kupon.kullanimKodu);

  // Görevli olmayan kupon kullanamaz
  await assert.rejects(can.kuponKullan(kupon.kullanimKodu), hataKodu('YETKISIZ'));

  const sonuc = await gorevli.kuponKullan(kupon.kullanimKodu.toLowerCase());
  assert.deepEqual(sonuc, { urun: 'Filtre kahve', kullanildi: true });
  await assert.rejects(gorevli.kuponKullan(kupon.kullanimKodu), hataKodu('ZATEN_KULLANILDI'));

  assert.equal((await can.cuzdan()).bulduklarim[0].kuponDurumu, 'kullanildi');
  const liste = await gorevli.kafeKuponlari();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].durum, 'kullanildi');
});

test('altın: açılım bulan onaylayınca; 3 şikâyette altın hakkı kapanır', async () => {
  const veri = bosVeri();
  let gun = 1;
  const saat = () => new Date(2026, 11, gun, 13, 0);
  const ayse = await oyuncu(veri, 'Ayşe', { saat });
  const can = await oyuncu(veri, 'Can', { saat });
  const altin = { seviye: 'altin', ...KUTUPHANE, ipucuMetni: 'Ağacın dibi', cekMarkasi: 'Kitapçı', cekKodu: 'ABC-123' };

  const ilk = await ayse.hediyeSakla(altin);
  assert.equal((await ayse.oturumAc()).acilim, 0);
  const kayit = await can.hediyeAl(ilk.qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(kayit.cekKodu, 'ABC-123');
  await assert.rejects(ayse.cekSonucu(ilk.hediyeId, true), hataKodu('YETKISIZ'));
  await can.cekSonucu(ilk.hediyeId, true);
  assert.equal((await ayse.oturumAc()).acilim, KURALLAR.ACILIM.altin);
  await assert.rejects(can.cekSonucu(ilk.hediyeId, false), hataKodu('GECERSIZ'));

  for (let k = 0; k < 3; k++) {
    gun++;
    const h = await ayse.hediyeSakla(altin);
    await can.hediyeAl(h.qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam);
    await can.cekSonucu(h.hediyeId, false);
  }
  gun++;
  await assert.rejects(ayse.hediyeSakla(altin), hataKodu('YETKISIZ'));
});

test('kalp: 5 kalpte saklayana +3; bildir: 2 bildirimde gizlenir', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  let acilimOnce;
  for (let k = 0; k < 5; k++) {
    // Ayşe'nin 5 notu, günlük sınıra takılmasın diye farklı günlerde saklanır; her birini başka biri bulur
    const gunluk = await oyuncu(veri, 'Bulan' + k);
    const saklayan = await istemciOlustur({ veri, demo: true, saat: () => new Date(2026, 11, 1 + k, 13), oyuncuId: ayse.sahte.oyuncuId() });
    const { hediyeId, qrKodu } = await saklayan.hediyeSakla(karHediyesi());
    await gunluk.hediyeAl(qrKodu, KUTUPHANE.enlem, KUTUPHANE.boylam);
    if (k === 4) acilimOnce = (await ayse.oturumAc()).acilim;
    await gunluk.kalpVer(hediyeId);
    await gunluk.kalpVer(hediyeId); // ikinci kalp sayılmaz
  }
  assert.equal((await ayse.oturumAc()).acilim, acilimOnce + KURALLAR.KALP_ODULU);

  const { hediyeId } = await ayse.hediyeSakla(karHediyesi());
  const b1 = await oyuncu(veri, 'B1');
  const b2 = await oyuncu(veri, 'B2');
  await b1.bildir(hediyeId);
  await b1.bildir(hediyeId);
  assert.equal(veri.hediyeler[hediyeId].durum, 'saklandi');
  await b2.bildir(hediyeId);
  assert.equal(veri.hediyeler[hediyeId].durum, 'gizlendi');
  assert.equal((await b1.yakinHediyeler(KUTUPHANE.enlem, KUTUPHANE.boylam)).length, 0);
});

test('ipucu fotoğrafı veri adresi olarak döner', async () => {
  const veri = bosVeri();
  const ayse = await oyuncu(veri, 'Ayşe');
  const can = await oyuncu(veri, 'Can');
  const foto = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
  const { hediyeId } = await ayse.hediyeSakla(karHediyesi({ ipucuFoto: foto }));
  const { fotoUrl } = await can.ipucuGetir(hediyeId, KUTUPHANE.enlem, KUTUPHANE.boylam);
  assert.equal(fotoUrl, 'data:image/jpeg;base64,AQID');
});
