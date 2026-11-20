// js/oyun/istemci.js'in Supabase'e doğru çağrılar yaptığını ve hataları OyunHatasi'na
// çevirdiğini sahte bir supabase nesnesiyle sınar. Ağ yok. Çalıştırma: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istemciOlustur } from '../js/oyun/istemci.js';
import { OyunHatasi } from '../js/oyun/arayuz.js';

const AYARLAR = { supabaseUrl: 'https://ornek.supabase.co', supabaseAnahtari: 'sb_publishable_test' };
const HEX = '0123456789abcdef0123456789abcdef';

// rpcYanitlari: { ad: data | { error } | (parametreler) => ... }
function sahteSupabase({ oturumVar = false, rpcYanitlari = {}, rpcAtar = false } = {}) {
  const kayit = { rpc: [], yukleme: [], imza: [], anonim: 0, createClient: null };
  let oturum = oturumVar ? { user: { id: 'kullanici-1' } } : null;
  const sb = {
    auth: {
      async getSession() { return { data: { session: oturum }, error: null }; },
      async signInAnonymously() {
        kayit.anonim++;
        oturum = { user: { id: 'kullanici-1' } };
        return { data: { user: oturum.user, session: oturum }, error: null };
      }
    },
    async rpc(ad, parametreler) {
      kayit.rpc.push({ ad, parametreler });
      if (rpcAtar) throw new TypeError('Failed to fetch');
      let y = rpcYanitlari[ad];
      if (typeof y === 'function') y = y(parametreler);
      if (y && y.error) return { data: null, error: y.error };
      return { data: y ?? null, error: null };
    },
    storage: {
      from(kova) {
        return {
          async upload(yol, dosya, secenek) { kayit.yukleme.push({ kova, yol, secenek }); return { data: { path: yol }, error: null }; },
          async createSignedUrl(yol, sn) { kayit.imza.push({ kova, yol, sn }); return { data: { signedUrl: `https://imzali/${yol}` }, error: null }; }
        };
      }
    }
  };
  const createClient = (url, anahtar, secenek) => { kayit.createClient = { url, anahtar, secenek }; return sb; };
  return { createClient, kayit };
}

test('yalnızca publishable anahtar kabul edilir', async () => {
  const { createClient } = sahteSupabase();
  await assert.rejects(istemciOlustur({ supabaseUrl: 'https://x', supabaseAnahtari: 'eyJhbGciOi...' }, { createClient }), /sb_publishable_/);
  await assert.rejects(istemciOlustur({ supabaseAnahtari: 'sb_publishable_x' }, { createClient }), /supabaseUrl/);
});

test('oturumAc: oturum yoksa anonim oturum açar, oyuncu satırı yoksa null döner', async () => {
  const { createClient, kayit } = sahteSupabase();
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  assert.equal(kayit.createClient.anahtar, 'sb_publishable_test');
  assert.equal(await istemci.oturumAc(), null);
  assert.equal(kayit.anonim, 1);
  assert.deepEqual(kayit.rpc.at(-1), { ad: 'oyuncu_bilgisi', parametreler: {} });
  await istemci.oturumAc();
  assert.equal(kayit.anonim, 1, 'oturum varken yeniden açılmamalı');
});

test('hediyeSakla: gümüşte kupon QR ayrıştırılır, parametre adları SQL ile aynı', async () => {
  const { createClient, kayit } = sahteSupabase({
    oturumVar: true,
    rpcYanitlari: { hediye_sakla: { hediyeId: 'h1', qrKodu: 'MGH1:' + HEX } }
  });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  const sonuc = await istemci.hediyeSakla({
    seviye: 'gumus', enlem: 39.8915, boylam: 32.7835, ipucuMetni: 'bankın altı', kuponQr: 'MGK1:' + HEX
  });
  assert.deepEqual(sonuc, { hediyeId: 'h1', qrKodu: 'MGH1:' + HEX });
  assert.deepEqual(kayit.rpc.at(-1), {
    ad: 'hediye_sakla',
    parametreler: {
      p_seviye: 'gumus', p_enlem: 39.8915, p_boylam: 32.7835, p_ipucu_metni: 'bankın altı',
      p_ipucu_foto: null, p_not_metni: null, p_kupon_kodu: HEX, p_cek_markasi: null, p_cek_kodu: null
    }
  });
  await assert.rejects(
    istemci.hediyeSakla({ seviye: 'gumus', enlem: 1, boylam: 1, ipucuMetni: 'x', kuponQr: 'MGH1:' + HEX }),
    (h) => h instanceof OyunHatasi && h.kod === 'GECERSIZ_KUPON');
});

test('hediyeSakla: ipucu fotoğrafı kullanıcının klasörüne yüklenir', async () => {
  const { createClient, kayit } = sahteSupabase({ oturumVar: true, rpcYanitlari: { hediye_sakla: { hediyeId: 'h', qrKodu: 'q' } } });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  await istemci.hediyeSakla({
    seviye: 'kar', enlem: 1, boylam: 2, ipucuMetni: 'ipucu', notMetni: 'not',
    ipucuFoto: new Blob(['x'], { type: 'image/jpeg' })
  });
  assert.equal(kayit.yukleme.length, 1);
  assert.equal(kayit.yukleme[0].kova, 'ipucu-fotolari');
  assert.match(kayit.yukleme[0].yol, /^kullanici-1\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(kayit.rpc.at(-1).parametreler.p_ipucu_foto, kayit.yukleme[0].yol);
  await assert.rejects(
    istemci.hediyeSakla({ seviye: 'kar', enlem: 1, boylam: 2, ipucuMetni: 'i', notMetni: 'n', ipucuFoto: new Blob(['x'], { type: 'image/gif' }) }),
    (h) => h.kod === 'GECERSIZ');
});

test('hediyeAl: yalnızca MGH1 kartları sunucuya gider', async () => {
  const { createClient, kayit } = sahteSupabase({ oturumVar: true, rpcYanitlari: { hediye_al: { hediyeId: 'h1', seviye: 'kar' } } });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  await assert.rejects(istemci.hediyeAl('https://kotu.site', 1, 2), (h) => h.kod === 'GECERSIZ_QR');
  await assert.rejects(istemci.hediyeAl('MGK1:' + HEX, 1, 2), (h) => h.kod === 'GECERSIZ_QR');
  assert.equal(kayit.rpc.length, 0);
  const kayit1 = await istemci.hediyeAl(' MGH1:' + HEX + '\n', 39.1, 32.1);
  assert.equal(kayit1.hediyeId, 'h1');
  assert.deepEqual(kayit.rpc[0], { ad: 'hediye_al', parametreler: { p_qr_kodu: HEX, p_enlem: 39.1, p_boylam: 32.1 } });
});

test('sunucu hata kodları OyunHatasi kodlarına çevrilir', async () => {
  const { createClient } = sahteSupabase({
    oturumVar: true,
    rpcYanitlari: {
      hediye_al: { error: { message: 'ZATEN_ALINDI', details: 'Bu hediye daha önce bulundu', code: 'P0001' } },
      cuzdan: { error: { message: 'permission denied for function cuzdan', code: '42501' } },
      kupon_kullan: { error: { message: 'beklenmedik', code: '22P02' } }
    }
  });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  await assert.rejects(istemci.hediyeAl('MGH1:' + HEX, 1, 2),
    (h) => h instanceof OyunHatasi && h.kod === 'ZATEN_ALINDI' && h.message === 'Bu hediye daha önce bulundu');
  await assert.rejects(istemci.cuzdan(), (h) => h.kod === 'YETKISIZ');
  await assert.rejects(istemci.kuponKullan('ABC123'), (h) => h.kod === 'GECERSIZ');
});

test('ağ hatası AG olur', async () => {
  const { createClient } = sahteSupabase({ oturumVar: true, rpcAtar: true });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  await assert.rejects(istemci.yakinHediyeler(1, 2), (h) => h.kod === 'AG');
});

test('ipucuGetir: fotoğraf varsa 10 dakikalık imzalı bağlantı üretir', async () => {
  const { createClient, kayit } = sahteSupabase({
    oturumVar: true,
    rpcYanitlari: {
      ipucu_getir: (p) => p.p_hediye_id === 'h1'
        ? { metin: 'bankın altı', fotoYolu: 'u/f.jpg' }
        : { metin: 'fotoğrafsız', fotoYolu: null }
    }
  });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  assert.deepEqual(await istemci.ipucuGetir('h1', 1, 2), { metin: 'bankın altı', fotoUrl: 'https://imzali/u/f.jpg' });
  assert.deepEqual(kayit.imza[0], { kova: 'ipucu-fotolari', yol: 'u/f.jpg', sn: 600 });
  assert.deepEqual(await istemci.ipucuGetir('h2', 1, 2), { metin: 'fotoğrafsız', fotoUrl: null });
});

test('boş sonuçlar varsayılan değerlere döner, void yöntemler undefined döner', async () => {
  const { createClient, kayit } = sahteSupabase({ oturumVar: true });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  assert.deepEqual(await istemci.yakinHediyeler(1, 2), []);
  assert.deepEqual(await istemci.cuzdan(), { bulduklarim: [], sakladiklarim: [] });
  assert.deepEqual(await istemci.kafeKuponlari(), []);
  assert.equal(await istemci.kalpVer('h1'), undefined);
  assert.equal(await istemci.cekSonucu('h1', false), undefined);
  assert.deepEqual(kayit.rpc.at(-1), { ad: 'cek_sonucu', parametreler: { p_hediye_id: 'h1', p_calisti: false } });
});

test('kafe yöntemleri oturumu kendisi açar ve doğru fonksiyonları çağırır', async () => {
  const { createClient, kayit } = sahteSupabase({ rpcYanitlari: { gorevli_ol: { id: 'k1', ad: 'Kafe' } } });
  const istemci = await istemciOlustur(AYARLAR, { createClient });
  assert.deepEqual(await istemci.gorevliOl('k1', 'sifre'), { id: 'k1', ad: 'Kafe' });
  assert.equal(kayit.anonim, 1);
  assert.deepEqual(kayit.rpc.at(-1), { ad: 'gorevli_ol', parametreler: { p_kafe_id: 'k1', p_panel_sifresi: 'sifre' } });
  await istemci.kuponOlustur('Filtre kahve');
  assert.deepEqual(kayit.rpc.at(-1), { ad: 'kupon_olustur', parametreler: { p_urun: 'Filtre kahve' } });
});
