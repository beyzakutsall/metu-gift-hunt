-- ODTÜ Hediye Avı: sunucu testleri. 001-004'ten sonra SQL Editor'e yapıştırılıp çalıştırılır.
--
-- Hepsi tek transaction içinde çalışır ve sonda rollback edilir; veritabanında iz kalmaz.
-- Başarılıysa hata çıkmaz ve son sorgu "TAMAM: ..." satırlarını listeler.
-- Bir test başarısızsa "TEST BAŞARISIZ: ..." hatasıyla durur. O zaman bir kez `rollback;` çalıştırın.
--
-- Oyuncular, Supabase'in yaptığı gibi request.jwt.claims ayarı + authenticated rolüyle taklit
-- edilir; yani yetkiler (GRANT/REVOKE) ve RLS de gerçekten sınanır.
--   A = ...0a saklayan, B = ...0b bulan, C = ...0c üçüncü oyuncu, G = ...0d kafe görevlisi
-- Konumlar: Kütüphane (39.8915, 32.7835); ~100 m kuzeyi (39.8924, 32.7835); ~400 m (39.8951, 32.7835)

begin;

-- ---------------------------------------------------------------- hazırlık (postgres olarak)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a@test.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'b@test.invalid'),
  ('00000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'c@test.invalid'),
  ('00000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'd@test.invalid');

-- Gecikme ve gece kuralı testte kapalı (yalnızca bu transaction içinde)
update public.oyun_ayarlari set gorunme_gecikmesi_dk = 0, gece_gizle = false;

insert into public.kafeler (id, ad, panel_sifresi_ozeti) values
  ('00000000-0000-4000-8000-0000000000cf', 'Test Kafe',
   extensions.crypt('test-panel-sifresi', extensions.gen_salt('bf')));

select set_config('test.sonuc', '', true);

-- ---------------------------------------------------------------- yetkiler
set local role anon;
do $$
declare v_hata text;
begin
  begin perform public.oyuncu_bilgisi(); exception when others then v_hata := sqlstate; end;
  if v_hata is distinct from '42501' then
    raise exception 'TEST BAŞARISIZ: anon RPC çağıramamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: anon RPC çağıramıyor', true);
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_hata text;
begin
  begin perform 1 from public.hediyeler limit 1; exception when others then v_hata := sqlstate; end;
  if v_hata is distinct from '42501' then
    raise exception 'TEST BAŞARISIZ: hediyeler tablosu doğrudan okunamamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v_hata := null;
  begin perform public._ozet('x'); exception when others then v_hata := sqlstate; end;
  if v_hata is distinct from '42501' then
    raise exception 'TEST BAŞARISIZ: yardımcı fonksiyonlar dışarı kapalı olmalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: tablolar ve yardımcılar doğrudan erişime kapalı', true);
end $$;

-- ---------------------------------------------------------------- oyuncular
do $$
declare v_hata text; v jsonb;
begin
  if public.oyuncu_bilgisi() is not null then
    raise exception 'TEST BAŞARISIZ: oyuncu satırı yokken oyuncu_bilgisi null olmalı';
  end if;
  begin perform public.cuzdan(); exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'OTURUM_YOK' then
    raise exception 'TEST BAŞARISIZ: oyuncu satırı yokken OTURUM_YOK beklenirdi (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v := public.oyuncu_olustur('  Ayşe ');
  if v->>'takmaAd' <> 'Ayşe' or (v->>'acilim')::int <> 0 then
    raise exception 'TEST BAŞARISIZ: oyuncu_olustur yanlış döndü: %', v;
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: oyuncu oluşturma', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select public.oyuncu_olustur('Bora');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select public.oyuncu_olustur('Cem');

-- ---------------------------------------------------------------- saklama (A)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare v jsonb; v_hata text;
begin
  v := public.hediye_sakla('kar', 39.8915, 32.7835, 'Kütüphane girişinin solundaki bankın altı',
                           null, 'Mutlu yıllar!');
  if v->>'qrKodu' !~ '^MGH1:[0-9a-f]{32}$' then
    raise exception 'TEST BAŞARISIZ: QR kodu biçimi yanlış: %', v->>'qrKodu';
  end if;
  perform set_config('test.qr1', v->>'qrKodu', true);
  perform set_config('test.h1', v->>'hediyeId', true);
  if (public.oyuncu_bilgisi()->>'acilim')::int <> 1 then
    raise exception 'TEST BAŞARISIZ: kar saklayınca açılım 1 olmalı';
  end if;

  begin perform public.hediye_sakla('kar', 39.8888, 32.7879, 'yurt önü', null, 'not');
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YASAK_BOLGE' then
    raise exception 'TEST BAŞARISIZ: yurt bölgesinde saklama reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v_hata := null;
  begin perform public.hediye_sakla('kar', 39.9500, 32.7000, 'kampüs dışı', null, 'not');
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YASAK_BOLGE' then
    raise exception 'TEST BAŞARISIZ: kampüs dışında saklama reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v_hata := null;
  begin perform public.hediye_sakla('kar', 39.8915, 32.7835, 'notsuz kar', null, null);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'GECERSIZ' then
    raise exception 'TEST BAŞARISIZ: notsuz kar reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: saklama, QR biçimi, yasak bölge ve kampüs sınırı', true);
end $$;

-- Kendi hediyesini alamaz
do $$
declare v_hata text;
begin
  begin perform public.hediye_al(current_setting('test.qr1'), 39.8915, 32.7835);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'KENDI_HEDIYEN' then
    raise exception 'TEST BAŞARISIZ: kendi hediyesini alma reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: kendi hediyesini alma reddedildi', true);
end $$;

-- Günlük sınır: A iki tane daha saklar (toplam 3), dördüncüsü reddedilir
do $$
declare v_hata text;
begin
  perform public.hediye_sakla('kar', 39.8905, 32.7820, 'çöp kutusunun arkası', null, 'İkinci not');
  perform public.hediye_sakla('kar', 39.8910, 32.7850, 'lambanın dibi', null, 'Üçüncü not');
  begin perform public.hediye_sakla('kar', 39.8908, 32.7840, 'dördüncü', null, 'Dördüncü not');
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'GUNLUK_SINIR' then
    raise exception 'TEST BAŞARISIZ: günlük 4. saklama reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: günlük 3 saklama sınırı', true);
end $$;

-- ---------------------------------------------------------------- bulma (B)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare v jsonb; v_hata text;
begin
  v := public.yakin_hediyeler(39.8915, 32.7835);
  if jsonb_array_length(v) <> 3
     or not exists (select 1 from jsonb_array_elements(v) e where e->>'id' = current_setting('test.h1')) then
    raise exception 'TEST BAŞARISIZ: B, A''nın 3 hediyesini görmeli (gelen: %)', v;
  end if;

  begin perform public.ipucu_getir(current_setting('test.h1')::uuid, 39.8951, 32.7835);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'UZAK' then
    raise exception 'TEST BAŞARISIZ: 400 m''den ipucu reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v := public.ipucu_getir(current_setting('test.h1')::uuid, 39.8915, 32.7835);
  if v->>'metin' not like 'Kütüphane%' then
    raise exception 'TEST BAŞARISIZ: ipucu metni yanlış: %', v;
  end if;

  v_hata := null;
  begin perform public.hediye_al(current_setting('test.qr1'), 39.8924, 32.7835);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'UZAK' then
    raise exception 'TEST BAŞARISIZ: 60 m dışından alma reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;

  v_hata := null;
  begin perform public.hediye_al('MGH1:00000000000000000000000000000000', 39.8915, 32.7835);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'GECERSIZ_QR' then
    raise exception 'TEST BAŞARISIZ: bilinmeyen QR reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;

  v := public.hediye_al(current_setting('test.qr1'), 39.8915, 32.7835);
  if v->>'seviye' <> 'kar' or v->>'notMetni' <> 'Mutlu yıllar!' or v->>'saklayanTakmaAd' <> 'Ayşe' then
    raise exception 'TEST BAŞARISIZ: alınan hediyenin cüzdan kaydı yanlış: %', v;
  end if;

  perform public.kalp_ver(current_setting('test.h1')::uuid);
  perform public.kalp_ver(current_setting('test.h1')::uuid); -- ikinci kez: sessizce yok sayılır
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: yakın hediyeler, 30 m ipucu, 60 m dışı alma reddi, alma, kalp', true);
end $$;

-- İkinci okutma (C) reddedilir; C bulmadığı hediyeye kalp veremez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare v_hata text;
begin
  begin perform public.hediye_al(current_setting('test.qr1'), 39.8915, 32.7835);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'ZATEN_ALINDI' then
    raise exception 'TEST BAŞARISIZ: ikinci okutma reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v_hata := null;
  begin perform public.kalp_ver(current_setting('test.h1')::uuid);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YETKISIZ' then
    raise exception 'TEST BAŞARISIZ: bulmadığı hediyeye kalp reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v_hata := null;
  begin perform public.bildir(current_setting('test.h1')::uuid);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YETKISIZ' then
    raise exception 'TEST BAŞARISIZ: görmediği hediyeyi bildirme reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: ikinci okutma reddedildi', true);
end $$;

-- ---------------------------------------------------------------- altın (C saklar, B bulur)
do $$
declare v jsonb; v_hata text;
begin
  v := public.hediye_sakla('altin', 39.8912, 32.7830, 'heykelin arkası', null, null, null, 'Kitapçı', 'ALTIN-123');
  perform set_config('test.qr_altin', v->>'qrKodu', true);
  perform set_config('test.h_altin', v->>'hediyeId', true);
  if (public.oyuncu_bilgisi()->>'acilim')::int <> 0 then
    raise exception 'TEST BAŞARISIZ: altın saklayınca açılım hemen verilmemeli';
  end if;
  begin perform public.hediye_sakla('altin', 39.8913, 32.7832, 'ikinci altın', null, null, null, 'Kitapçı', 'X');
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'ALTIN_SINIRI' then
    raise exception 'TEST BAŞARISIZ: günde 2. altın reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: altın saklama ve günlük 1 altın sınırı', true);
end $$;

-- ---------------------------------------------------------------- kafe (G görevli, oyuncu satırı yok)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);

do $$
declare v jsonb; v_hata text;
begin
  begin perform public.kupon_kullan('ABCDEF'); exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YETKISIZ' then
    raise exception 'TEST BAŞARISIZ: görevli olmayan kupon kullanamamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  v_hata := null;
  begin perform public.gorevli_ol('00000000-0000-4000-8000-0000000000cf', 'yanlis');
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YETKISIZ' then
    raise exception 'TEST BAŞARISIZ: yanlış panel şifresi reddedilmeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  if public.kafem() is not null then
    raise exception 'TEST BAŞARISIZ: görevli olmadan kafem null olmalı';
  end if;

  v := public.gorevli_ol('00000000-0000-4000-8000-0000000000cf', 'test-panel-sifresi');
  if v->>'ad' <> 'Test Kafe' or public.kafem()->>'ad' <> 'Test Kafe' then
    raise exception 'TEST BAŞARISIZ: görevli girişi yanlış: %', v;
  end if;
  v := public.kupon_olustur('Filtre kahve');
  if v->>'qrKodu' !~ '^MGK1:[0-9a-f]{32}$' or v->>'kullanimKodu' !~ '^[A-Z0-9]{6}$' then
    raise exception 'TEST BAŞARISIZ: kupon biçimi yanlış: %', v;
  end if;
  perform set_config('test.kupon_qr', v->>'qrKodu', true);
  perform set_config('test.kupon_kod', v->>'kullanimKodu', true);

  v_hata := null;
  begin perform public.kupon_kullan(current_setting('test.kupon_kod'));
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'GECERSIZ_KUPON' then
    raise exception 'TEST BAŞARISIZ: bulunmamış kupon kullanılamamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: görevli girişi ve kupon oluşturma', true);
end $$;

-- C gümüş saklar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare v jsonb; v_hata text;
begin
  v := public.hediye_sakla('gumus', 39.8920, 32.7840, 'çeşmenin yanı', null, null, current_setting('test.kupon_qr'));
  perform set_config('test.qr_gumus', v->>'qrKodu', true);
  if (public.oyuncu_bilgisi()->>'acilim')::int <> 3 then
    raise exception 'TEST BAŞARISIZ: gümüş saklayınca açılım 3 olmalı';
  end if;
  begin perform public.hediye_sakla('gumus', 39.8920, 32.7840, 'aynı kupon', null, null, current_setting('test.kupon_qr'));
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'GECERSIZ_KUPON' then
    raise exception 'TEST BAŞARISIZ: aynı kupon ikinci kez saklanamamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: gümüş saklama, kupon tek kullanımlık', true);
end $$;

-- B, gümüşü ve altını bulur; altın kodu çalıştı der
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare v jsonb; v_hata text;
begin
  v := public.hediye_al(current_setting('test.qr_gumus'), 39.8920, 32.7840);
  if v->>'urun' <> 'Filtre kahve' or v->>'kafeAdi' <> 'Test Kafe'
     or v->>'kullanimKodu' <> current_setting('test.kupon_kod') then
    raise exception 'TEST BAŞARISIZ: gümüş cüzdan kaydı yanlış: %', v;
  end if;
  perform set_config('test.kupon_kod', v->>'kullanimKodu', true);

  v := public.hediye_al(current_setting('test.qr_altin'), 39.8912, 32.7830);
  if v->>'cekKodu' <> 'ALTIN-123' or v->>'cekMarkasi' <> 'Kitapçı' then
    raise exception 'TEST BAŞARISIZ: altın cüzdan kaydı yanlış: %', v;
  end if;
  perform public.cek_sonucu(current_setting('test.h_altin')::uuid, true);
  begin perform public.cek_sonucu(current_setting('test.h_altin')::uuid, false);
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'GECERSIZ' then
    raise exception 'TEST BAŞARISIZ: çek sonucu ikinci kez verilememeli (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;

  v_hata := null;
  begin perform public.kupon_kullan(current_setting('test.kupon_kod'));
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'YETKISIZ' then
    raise exception 'TEST BAŞARISIZ: oyuncu kupon kullanamamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;

  v := public.cuzdan();
  if jsonb_array_length(v->'bulduklarim') <> 3 then
    raise exception 'TEST BAŞARISIZ: B''nin cüzdanında 3 hediye olmalı: %', v;
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: gümüş ve altın bulma, çek sonucu, cüzdan', true);
end $$;

-- C'nin açılımı: gümüş 3 + altın onayı 10 = 13
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
  if (public.oyuncu_bilgisi()->>'acilim')::int <> 13 then
    raise exception 'TEST BAŞARISIZ: C''nin açılımı 13 olmalı (gelen: %)', public.oyuncu_bilgisi()->>'acilim';
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: altın onayında +10 açılım', true);
end $$;

-- Görevli kuponu kapatır; ikinci kez kullanılamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);

do $$
declare v jsonb; v_hata text;
begin
  v := public.kupon_kullan(lower(current_setting('test.kupon_kod')));
  if v->>'urun' <> 'Filtre kahve' or not (v->>'kullanildi')::boolean then
    raise exception 'TEST BAŞARISIZ: kupon kullanımı yanlış: %', v;
  end if;
  begin perform public.kupon_kullan(current_setting('test.kupon_kod'));
  exception when others then v_hata := sqlerrm; end;
  if v_hata is distinct from 'ZATEN_KULLANILDI' then
    raise exception 'TEST BAŞARISIZ: kupon ikinci kez kullanılamamalı (gelen: %)', coalesce(v_hata, 'hata yok');
  end if;
  if jsonb_array_length(public.kafe_kuponlari()) <> 1 then
    raise exception 'TEST BAŞARISIZ: kafe kupon listesinde 1 kupon olmalı';
  end if;
  perform set_config('test.sonuc', current_setting('test.sonuc') || '|TAMAM: kupon kullanma, ikinci kullanım reddi, kafe listesi', true);
end $$;

-- ---------------------------------------------------------------- sonuç
reset role;
select btrim(s) as sonuc
  from unnest(string_to_array(current_setting('test.sonuc'), '|')) s
 where btrim(s) <> '';

rollback;
