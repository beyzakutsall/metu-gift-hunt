-- ODTÜ Hediye Avı: sunucu fonksiyonları (RPC). 001'den sonra yapıştırılır.
--
-- * Hepsi security definer: tablolara doğrudan erişim kapalı (001), fonksiyon kendi
--   kontrollerini yapıp tablo sahibi olarak okur/yazar.
-- * Hepsinde set search_path = '' ve tam nitelikli adlar (public., auth., extensions.).
-- * Hatalar: message alanı docs/UYGULAMA.md §4'teki hata kodudur (UZAK, ZATEN_ALINDI ...),
--   detail alanı Türkçe açıklamadır. js/oyun/istemci.js bunu OyunHatasi'na çevirir.
-- * Dönüş değerleri jsonb ve alan adları istemcideki gibi camelCase.
-- * "_" ile başlayan yardımcılar dışarı açılmaz; en altta yetkiler açıkça yazılır.

-- ================================================================ yardımcılar

create or replace function public._hata(p_kod text, p_aciklama text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_kod, detail = coalesce(p_aciklama, p_kod), errcode = 'P0001';
end
$$;

-- İki nokta arası mesafe (metre), haversine
create or replace function public._mesafe_m(
  a_enlem double precision, a_boylam double precision,
  b_enlem double precision, b_boylam double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(b_enlem - a_enlem) / 2), 2) +
    cos(radians(a_enlem)) * cos(radians(b_enlem)) * power(sin(radians(b_boylam - a_boylam) / 2), 2))))
$$;

-- 128 bit rastgele kod (32 hex) ve SHA-256 özeti
create or replace function public._kod_uret()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(16), 'hex')
$$;

create or replace function public._ozet(p_metin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_metin, 'sha256'), 'hex')
$$;

-- Bugünün başlangıcı (İstanbul saatiyle)
create or replace function public._gun_baslangici()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'
$$;

-- 22:00-07:00 (İstanbul) arası mı
create or replace function public._gece_mi()
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(hour from now() at time zone 'Europe/Istanbul') >= 22
      or extract(hour from now() at time zone 'Europe/Istanbul') < 7
$$;

-- Oturumdaki oyuncunun kimliği; oturum ya da oyuncu satırı yoksa OTURUM_YOK
create or replace function public._oyuncu()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null or not exists (select 1 from public.oyuncular o where o.id = v_id) then
    perform public._hata('OTURUM_YOK', 'Önce oturum açılmalı ve oyuncu oluşturulmalı');
  end if;
  return v_id;
end
$$;

-- Oturumdaki görevlinin kafesi; görevli değilse YETKISIZ
create or replace function public._gorevli_kafesi()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kafe uuid;
begin
  select g.kafe_id into v_kafe from public.kafe_gorevlileri g where g.kullanici_id = auth.uid();
  if v_kafe is null then
    perform public._hata('YETKISIZ', 'Bu işlem yalnızca kafe görevlileri içindir');
  end if;
  return v_kafe;
end
$$;

create or replace function public._konum_gecerli(p_enlem double precision, p_boylam double precision)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_enlem is null or p_boylam is null
     or p_enlem not between -90 and 90 or p_boylam not between -180 and 180 then
    perform public._hata('GECERSIZ', 'Konum geçersiz');
  end if;
end
$$;

-- Saklama yeri kontrolü: kampüs sınırı (js/projeksiyon.js'deki SINIR) ve yasak bölgeler
create or replace function public._saklama_yeri_kontrol(p_enlem double precision, p_boylam double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._konum_gecerli(p_enlem, p_boylam);
  if not (p_enlem between 39.880 and 39.903 and p_boylam between 32.760 and 32.800) then
    perform public._hata('YASAK_BOLGE', 'Kampüs sınırı dışında saklanamaz');
  end if;
  if exists (select 1 from public.yasak_bolgeler y
             where p_enlem between y.guney and y.kuzey and p_boylam between y.bati and y.dogu) then
    perform public._hata('YASAK_BOLGE', 'Lojman, konut ve yurt alanlarında saklanamaz');
  end if;
end
$$;

-- Bulunan bir hediyenin cüzdan kaydı (CuzdanKaydi, §4)
create or replace function public._cuzdan_kaydi(p_hediye_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'hediyeId', h.id,
    'seviye', h.seviye,
    'saklayanTakmaAd', s.takma_ad,
    'bulunmaZamani', h.bulunma_zamani,
    'notMetni', h.not_metni,
    'kalpSayisi', case when h.seviye = 'kar'
                    then (select count(*) from public.kalpler k where k.hediye_id = h.id) end,
    'urun', ku.urun,
    'kafeAdi', ka.ad,
    'kullanimKodu', ku.kullanim_kodu,
    'kuponDurumu', ku.durum,
    'cekMarkasi', h.cek_markasi,
    'cekKodu', h.cek_kodu,
    'cekSonucu', h.cek_sonucu))
  from public.hediyeler h
  join public.oyuncular s on s.id = h.saklayan
  left join public.kuponlar ku on ku.id = h.kupon_id
  left join public.kafeler ka on ka.id = ku.kafe_id
  where h.id = p_hediye_id
$$;

-- ================================================================ oyuncu

-- Oturumdaki oyuncu ya da null (oyuncu satırı henüz yoksa)
create or replace function public.oyuncu_bilgisi()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', o.id, 'takmaAd', o.takma_ad, 'acilim', o.acilim)
  from public.oyuncular o
  where o.id = auth.uid()
$$;

create or replace function public.oyuncu_olustur(p_takma_ad text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
  v_ad text := btrim(p_takma_ad);
  v_oyuncu public.oyuncular;
begin
  if v_id is null then
    perform public._hata('OTURUM_YOK', 'Önce oturum açılmalı');
  end if;
  if v_ad is null or char_length(v_ad) not between 2 and 24 then
    perform public._hata('GECERSIZ', 'Takma ad 2-24 karakter olmalı');
  end if;
  insert into public.oyuncular (id, takma_ad) values (v_id, v_ad)
  on conflict (id) do update set takma_ad = excluded.takma_ad
  returning * into v_oyuncu;
  return jsonb_build_object('id', v_oyuncu.id, 'takmaAd', v_oyuncu.takma_ad, 'acilim', v_oyuncu.acilim);
end
$$;

-- ================================================================ saklama

-- p_kupon_kodu: gümüşte kafenin gösterdiği QR (MGK1:<hex> ya da yalnızca <hex>)
-- p_ipucu_foto: istemcinin önceden yüklediği Storage yolu (<uid>/<dosya>)
create or replace function public.hediye_sakla(
  p_seviye text,
  p_enlem double precision,
  p_boylam double precision,
  p_ipucu_metni text,
  p_ipucu_foto text default null,
  p_not_metni text default null,
  p_kupon_kodu text default null,
  p_cek_markasi text default null,
  p_cek_kodu text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_altin_kapali boolean;
  v_bugun integer;
  v_bugun_altin integer;
  v_kupon_kodu text;
  v_kupon public.kuponlar;
  v_gecikme integer;
  v_kod text := public._kod_uret();
  v_r double precision := 15 * sqrt(random());   -- 0-15 m, alanda düzgün dağılım
  v_aci double precision := 2 * pi() * random();
  v_ipucu text := btrim(p_ipucu_metni);
  v_not text := nullif(btrim(p_not_metni), '');
  v_id uuid;
begin
  if p_seviye is null or p_seviye not in ('kar', 'gumus', 'altin') then
    perform public._hata('GECERSIZ', 'Seviye kar, gumus ya da altin olmalı');
  end if;
  perform public._saklama_yeri_kontrol(p_enlem, p_boylam);
  if v_ipucu is null or char_length(v_ipucu) not between 3 and 280 then
    perform public._hata('GECERSIZ', 'İpucu 3-280 karakter olmalı');
  end if;
  if v_not is not null and char_length(v_not) > 1000 then
    perform public._hata('GECERSIZ', 'Not en fazla 1000 karakter olabilir');
  end if;

  -- Günlük sınır: oyuncu satırı kilitlenir ki aynı anda iki saklama sınırı aşamasın
  select o.altin_kapali into v_altin_kapali from public.oyuncular o where o.id = v_oyuncu for update;
  select count(*), count(*) filter (where h.seviye = 'altin')
    into v_bugun, v_bugun_altin
    from public.hediyeler h
   where h.saklayan = v_oyuncu and h.saklanma_zamani >= public._gun_baslangici();
  if v_bugun >= 3 then
    perform public._hata('GUNLUK_SINIR', 'Günde en fazla 3 hediye saklanabilir');
  end if;
  if p_seviye = 'altin' and (v_bugun_altin >= 1 or v_altin_kapali) then
    perform public._hata('ALTIN_SINIRI', case when v_altin_kapali
      then 'Altın saklama hakkın şikâyetler yüzünden kapandı'
      else 'Günde en fazla 1 altın hediye saklanabilir' end);
  end if;

  if p_ipucu_foto is not null then
    if p_ipucu_foto not like v_oyuncu::text || '/%'
       or not exists (select 1 from storage.objects so
                      where so.bucket_id = 'ipucu-fotolari' and so.name = p_ipucu_foto) then
      perform public._hata('GECERSIZ', 'İpucu fotoğrafı bulunamadı');
    end if;
  end if;

  if p_seviye = 'kar' and v_not is null then
    perform public._hata('GECERSIZ', 'Kar tanesi hediyesinde not zorunlu');
  elsif p_seviye = 'gumus' then
    v_kupon_kodu := lower(regexp_replace(btrim(coalesce(p_kupon_kodu, '')), '^MGK1:', ''));
    if v_kupon_kodu !~ '^[0-9a-f]{32}$' then
      perform public._hata('GECERSIZ_KUPON', 'Kupon QR''ı geçersiz');
    end if;
    select * into v_kupon from public.kuponlar k
     where k.kod_ozeti = public._ozet(v_kupon_kodu) for update;
    if not found or v_kupon.durum <> 'hazir' then
      perform public._hata('GECERSIZ_KUPON', 'Kupon bulunamadı ya da zaten saklanmış');
    end if;
  elsif p_seviye = 'altin'
        and (nullif(btrim(p_cek_markasi), '') is null or nullif(btrim(p_cek_kodu), '') is null) then
    perform public._hata('GECERSIZ', 'Altın hediyede çek markası ve kodu zorunlu');
  end if;

  select a.gorunme_gecikmesi_dk into v_gecikme from public.oyun_ayarlari a;

  insert into public.hediyeler (
    saklayan, seviye, qr_ozeti, enlem, boylam, gosterim_enlem, gosterim_boylam,
    ipucu_metni, ipucu_foto, not_metni, kupon_id, cek_markasi, cek_kodu, gorunme_zamani)
  values (
    v_oyuncu, p_seviye, public._ozet(v_kod), p_enlem, p_boylam,
    p_enlem + v_r * cos(v_aci) / 111320.0,
    p_boylam + v_r * sin(v_aci) / (111320.0 * cos(radians(p_enlem))),
    v_ipucu, p_ipucu_foto, v_not,
    case when p_seviye = 'gumus' then v_kupon.id end,
    case when p_seviye = 'altin' then btrim(p_cek_markasi) end,
    case when p_seviye = 'altin' then btrim(p_cek_kodu) end,
    now() + make_interval(mins => coalesce(v_gecikme, 30)))
  returning id into v_id;

  if p_seviye = 'gumus' then
    update public.kuponlar set durum = 'saklandi', saklanma = now() where id = v_kupon.id;
  end if;

  -- Açılım: kar +1 ve gümüş +3 hemen; altın +10 bulan "çalıştı" deyince (cek_sonucu)
  update public.oyuncular
     set acilim = acilim + case p_seviye when 'kar' then 1 when 'gumus' then 3 else 0 end
   where id = v_oyuncu;

  return jsonb_build_object('hediyeId', v_id, 'qrKodu', 'MGH1:' || v_kod);
end
$$;

-- ================================================================ bulma

-- Oyuncuya en yakın (3 + açılım) görünür, bulunmamış hediye; gece boş liste
create or replace function public.yakin_hediyeler(p_enlem double precision, p_boylam double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_n integer;
  v_gece_gizle boolean;
begin
  perform public._konum_gecerli(p_enlem, p_boylam);
  select a.gece_gizle into v_gece_gizle from public.oyun_ayarlari a;
  if coalesce(v_gece_gizle, true) and public._gece_mi() then
    return '[]'::jsonb;
  end if;
  select 3 + o.acilim into v_n from public.oyuncular o where o.id = v_oyuncu;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', y.id, 'seviye', y.seviye,
             'gosterimEnlem', y.gosterim_enlem, 'gosterimBoylam', y.gosterim_boylam)
           order by y.mesafe)
      from (select h.id, h.seviye, h.gosterim_enlem, h.gosterim_boylam,
                   public._mesafe_m(p_enlem, p_boylam, h.gosterim_enlem, h.gosterim_boylam) as mesafe
              from public.hediyeler h
             where h.durum = 'saklandi'
               and h.gorunme_zamani <= now()
               and h.saklayan <> v_oyuncu
             order by mesafe
             limit v_n) y
  ), '[]'::jsonb);
end
$$;

-- 30 m içindeyse ipucu metni ve fotoğrafın Storage yolu. Oyuncuya 10 dakikalık okuma izni
-- yazılır (fotoğraf için Storage politikası ve bildir() buna bakar). Konum saklanmaz.
create or replace function public.ipucu_getir(p_hediye_id uuid, p_enlem double precision, p_boylam double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_h public.hediyeler;
begin
  perform public._konum_gecerli(p_enlem, p_boylam);
  select * into v_h from public.hediyeler h where h.id = p_hediye_id;
  if not found or v_h.durum <> 'saklandi'
     or (v_h.gorunme_zamani > now() and v_h.saklayan <> v_oyuncu) then
    perform public._hata('GECERSIZ', 'Hediye bulunamadı');
  end if;
  if public._mesafe_m(p_enlem, p_boylam, v_h.enlem, v_h.boylam) > 30 then
    perform public._hata('UZAK', 'İpucu 30 m içinde açılır');
  end if;

  insert into public.ipucu_erisimleri (oyuncu_id, hediye_id, bitis)
  values (v_oyuncu, v_h.id, now() + interval '10 minutes')
  on conflict (oyuncu_id, hediye_id) do update set bitis = excluded.bitis;

  return jsonb_build_object('metin', v_h.ipucu_metni, 'fotoYolu', v_h.ipucu_foto);
end
$$;

-- QR okutma: tek kullanımlık, ilk okutan alır
create or replace function public.hediye_al(p_qr_kodu text, p_enlem double precision, p_boylam double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_kod text := lower(regexp_replace(btrim(coalesce(p_qr_kodu, '')), '^MGH1:', ''));
  v_h public.hediyeler;
begin
  perform public._konum_gecerli(p_enlem, p_boylam);
  if v_kod !~ '^[0-9a-f]{32}$' then
    perform public._hata('GECERSIZ_QR', 'Bu bir hediye kartı değil');
  end if;
  select * into v_h from public.hediyeler h where h.qr_ozeti = public._ozet(v_kod);
  if not found or v_h.durum = 'gizlendi' then
    perform public._hata('GECERSIZ_QR', 'Hediye kartı tanınmadı');
  end if;
  if v_h.saklayan = v_oyuncu then
    perform public._hata('KENDI_HEDIYEN', 'Kendi sakladığın hediyeyi alamazsın');
  end if;
  if v_h.durum <> 'saklandi' then
    perform public._hata('ZATEN_ALINDI', 'Bu hediye daha önce bulundu');
  end if;
  if public._mesafe_m(p_enlem, p_boylam, v_h.enlem, v_h.boylam) > 60 then
    perform public._hata('UZAK', 'Hediyeyi almak için 60 m içinde olmalısın');
  end if;

  -- Atomik: aynı anda iki okutmada yalnızca biri satırı günceller
  update public.hediyeler
     set durum = 'bulundu', bulan = v_oyuncu, bulunma_zamani = now()
   where id = v_h.id and bulan is null and durum = 'saklandi';
  if not found then
    perform public._hata('ZATEN_ALINDI', 'Bu hediye daha önce bulundu');
  end if;

  if v_h.kupon_id is not null then
    update public.kuponlar set durum = 'bulundu', bulunma = now()
     where id = v_h.kupon_id and durum = 'saklandi';
  end if;

  return public._cuzdan_kaydi(v_h.id);
end
$$;

create or replace function public.cuzdan()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
begin
  return jsonb_build_object(
    'bulduklarim', coalesce((
      select jsonb_agg(public._cuzdan_kaydi(h.id) order by h.bulunma_zamani desc)
        from public.hediyeler h where h.bulan = v_oyuncu), '[]'::jsonb),
    'sakladiklarim', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'hediyeId', h.id, 'seviye', h.seviye, 'durum', h.durum,
               'saklanmaZamani', h.saklanma_zamani, 'bulanTakmaAd', b.takma_ad))
             order by h.saklanma_zamani desc)
        from public.hediyeler h
        left join public.oyuncular b on b.id = h.bulan
       where h.saklayan = v_oyuncu), '[]'::jsonb));
end
$$;

-- ================================================================ ödüller ve bildirimler

-- Yalnızca bulduğun not (kar) hediyesine, bir kez. Saklayanın notları toplam her 5 kalpte +3 açılım.
create or replace function public.kalp_ver(p_hediye_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_h public.hediyeler;
  v_toplam integer;
begin
  select * into v_h from public.hediyeler h where h.id = p_hediye_id;
  if not found or v_h.seviye <> 'kar' or v_h.bulan is distinct from v_oyuncu then
    perform public._hata('YETKISIZ', 'Yalnızca bulduğun not hediyelerine kalp verebilirsin');
  end if;
  insert into public.kalpler (hediye_id, oyuncu_id) values (v_h.id, v_oyuncu)
  on conflict do nothing;
  if not found then
    return; -- zaten verilmiş
  end if;

  select count(*) into v_toplam
    from public.kalpler k join public.hediyeler x on x.id = k.hediye_id
   where x.saklayan = v_h.saklayan;
  update public.oyuncular
     set acilim = acilim + 3 * (v_toplam / 5 - kalp_odulleri),
         kalp_odulleri = v_toplam / 5
   where id = v_h.saklayan and kalp_odulleri < v_toplam / 5;
end
$$;

-- Altın: bulan bir kez yanıtlar. Çalıştı → saklayana +10. Çalışmadı → şikâyet; saklayanın
-- altınlarına 3 şikâyette altın saklama hakkı kapanır (açılım zaten verilmemiştir).
create or replace function public.cek_sonucu(p_hediye_id uuid, p_calisti boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_h public.hediyeler;
  v_sikayet integer;
begin
  if p_calisti is null then
    perform public._hata('GECERSIZ', 'Yanıt eksik');
  end if;
  select * into v_h from public.hediyeler h where h.id = p_hediye_id for update;
  if not found or v_h.seviye <> 'altin' or v_h.bulan is distinct from v_oyuncu then
    perform public._hata('YETKISIZ', 'Yalnızca bulduğun altın hediyeyi yanıtlayabilirsin');
  end if;
  if v_h.cek_sonucu is not null then
    perform public._hata('GECERSIZ', 'Bu hediye zaten yanıtlandı');
  end if;

  update public.hediyeler set cek_sonucu = p_calisti where id = v_h.id;
  if p_calisti then
    update public.oyuncular set acilim = acilim + 10 where id = v_h.saklayan;
  else
    insert into public.sikayetler (hediye_id, oyuncu_id, tur)
    values (v_h.id, v_oyuncu, 'cek_calismadi') on conflict do nothing;
    select count(*) into v_sikayet
      from public.sikayetler s join public.hediyeler x on x.id = s.hediye_id
     where x.saklayan = v_h.saklayan and s.tur = 'cek_calismadi';
    if v_sikayet >= 3 then
      update public.oyuncular set altin_kapali = true where id = v_h.saklayan;
    end if;
  end if;
end
$$;

-- Uygunsuz içerik bildirimi. Yalnızca hediyeyi bulan ya da ipucunu açmış (30 m içine gelmiş)
-- oyuncular bildirebilir; 2 bildirimde hediye gizlenir.
create or replace function public.bildir(p_hediye_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oyuncu uuid := public._oyuncu();
  v_h public.hediyeler;
  v_sayi integer;
begin
  select * into v_h from public.hediyeler h where h.id = p_hediye_id;
  if not found or v_h.saklayan = v_oyuncu then
    perform public._hata('GECERSIZ', 'Hediye bulunamadı');
  end if;
  if v_h.bulan is distinct from v_oyuncu
     and not exists (select 1 from public.ipucu_erisimleri e
                     where e.oyuncu_id = v_oyuncu and e.hediye_id = v_h.id) then
    perform public._hata('YETKISIZ', 'Yalnızca gördüğün hediyeleri bildirebilirsin');
  end if;

  insert into public.sikayetler (hediye_id, oyuncu_id, tur)
  values (v_h.id, v_oyuncu, 'uygunsuz') on conflict do nothing;
  select count(*) into v_sayi from public.sikayetler s
   where s.hediye_id = v_h.id and s.tur = 'uygunsuz';
  if v_sayi >= 2 then
    update public.hediyeler set durum = 'gizlendi' where id = v_h.id and durum = 'saklandi';
  end if;
end
$$;

-- Storage politikası (003) için: oturumdaki oyuncu bu ipucu fotoğrafını şu an görebilir mi
create or replace function public.ipucu_foto_izinli(p_yol text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.ipucu_erisimleri e
      join public.hediyeler h on h.id = e.hediye_id
     where e.oyuncu_id = auth.uid() and h.ipucu_foto = p_yol and e.bitis > now())
$$;

-- ================================================================ kafe

-- Panel giriş ekranı için kafe listesi
create or replace function public.kafe_listesi()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'ad', k.ad) order by k.ad), '[]'::jsonb)
  from public.kafeler k
$$;

create or replace function public.gorevli_ol(p_kafe_id uuid, p_panel_sifresi text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kullanici uuid := auth.uid();
  v_kafe public.kafeler;
begin
  if v_kullanici is null then
    perform public._hata('OTURUM_YOK', 'Önce oturum açılmalı');
  end if;
  select * into v_kafe from public.kafeler k where k.id = p_kafe_id;
  if not found or p_panel_sifresi is null
     or extensions.crypt(p_panel_sifresi, v_kafe.panel_sifresi_ozeti) <> v_kafe.panel_sifresi_ozeti then
    perform public._hata('YETKISIZ', 'Kafe ya da panel şifresi yanlış');
  end if;
  insert into public.kafe_gorevlileri (kullanici_id, kafe_id) values (v_kullanici, v_kafe.id)
  on conflict (kullanici_id) do update set kafe_id = excluded.kafe_id, baslama = now();
  return jsonb_build_object('id', v_kafe.id, 'ad', v_kafe.ad);
end
$$;

create or replace function public.kafem()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', k.id, 'ad', k.ad)
  from public.kafe_gorevlileri g
  join public.kafeler k on k.id = g.kafe_id
  where g.kullanici_id = auth.uid()
$$;

-- Askıda ürün: kupon QR'ı (MGK1) ve 6 karakterlik kullanım kodu
create or replace function public.kupon_olustur(p_urun text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kafe uuid := public._gorevli_kafesi();
  v_urun text := btrim(p_urun);
  v_kod text := public._kod_uret();
  v_alfabe constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 harf: I, O, 0, 1 yok
  v_bayt bytea;
  v_kullanim text;
  v_id uuid;
begin
  if v_urun is null or char_length(v_urun) not between 1 and 60 then
    perform public._hata('GECERSIZ', 'Ürün adı 1-60 karakter olmalı');
  end if;
  for v_deneme in 1..10 loop
    v_bayt := extensions.gen_random_bytes(6);
    v_kullanim := '';
    for v_i in 0..5 loop
      v_kullanim := v_kullanim || substr(v_alfabe, 1 + get_byte(v_bayt, v_i) % 32, 1);
    end loop;
    begin
      insert into public.kuponlar (kafe_id, urun, kod_ozeti, kullanim_kodu, olusturan)
      values (v_kafe, v_urun, public._ozet(v_kod), v_kullanim, auth.uid())
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- kullanım kodu çakıştı; yenisini dene
    end;
  end loop;
  if v_id is null then
    perform public._hata('GECERSIZ', 'Kupon oluşturulamadı, tekrar deneyin');
  end if;
  return jsonb_build_object('kuponId', v_id, 'qrKodu', 'MGK1:' || v_kod, 'kullanimKodu', v_kullanim);
end
$$;

-- Bulunan kuponu kasada kapatır; yalnızca o kafenin görevlisi
create or replace function public.kupon_kullan(p_kullanim_kodu text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kafe uuid := public._gorevli_kafesi();
  v_kupon public.kuponlar;
begin
  select * into v_kupon from public.kuponlar k
   where k.kullanim_kodu = upper(btrim(coalesce(p_kullanim_kodu, ''))) and k.kafe_id = v_kafe
   for update;
  if not found then
    perform public._hata('GECERSIZ_KUPON', 'Bu kafede böyle bir kupon yok');
  end if;
  if v_kupon.durum = 'kullanildi' then
    perform public._hata('ZATEN_KULLANILDI', 'Kupon daha önce kullanılmış');
  end if;
  if v_kupon.durum <> 'bulundu' then
    perform public._hata('GECERSIZ_KUPON', 'Kupon henüz bir oyuncu tarafından bulunmadı');
  end if;
  update public.kuponlar set durum = 'kullanildi', kullanilma = now() where id = v_kupon.id;
  return jsonb_build_object('urun', v_kupon.urun, 'kullanildi', true);
end
$$;

-- Görevlinin kafesinin son 7 günlük kuponları (gün sonu hesabı)
create or replace function public.kafe_kuponlari()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kafe uuid := public._gorevli_kafesi();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', k.id, 'urun', k.urun, 'durum', k.durum, 'kullanimKodu', k.kullanim_kodu,
             'olusturma', k.olusturma, 'kullanilma', k.kullanilma)
           order by k.olusturma desc)
      from public.kuponlar k
     where k.kafe_id = v_kafe and k.olusturma > now() - interval '7 days'
  ), '[]'::jsonb);
end
$$;

-- ================================================================ yetkiler
-- Postgres yeni fonksiyonlarda EXECUTE'u PUBLIC'e verir; hepsinden açıkça alınır.

-- Yardımcılar: dışarıya kapalı
revoke execute on function public._hata(text, text) from public, anon, authenticated;
revoke execute on function public._mesafe_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public._kod_uret() from public, anon, authenticated;
revoke execute on function public._ozet(text) from public, anon, authenticated;
revoke execute on function public._gun_baslangici() from public, anon, authenticated;
revoke execute on function public._gece_mi() from public, anon, authenticated;
revoke execute on function public._oyuncu() from public, anon, authenticated;
revoke execute on function public._gorevli_kafesi() from public, anon, authenticated;
revoke execute on function public._konum_gecerli(double precision, double precision) from public, anon, authenticated;
revoke execute on function public._saklama_yeri_kontrol(double precision, double precision) from public, anon, authenticated;
revoke execute on function public._cuzdan_kaydi(uuid) from public, anon, authenticated;

-- RPC'ler: yalnızca oturum açmış (anonim dahil) kullanıcılar
revoke execute on function public.oyuncu_bilgisi() from public, anon;
revoke execute on function public.oyuncu_olustur(text) from public, anon;
revoke execute on function public.hediye_sakla(text, double precision, double precision, text, text, text, text, text, text) from public, anon;
revoke execute on function public.yakin_hediyeler(double precision, double precision) from public, anon;
revoke execute on function public.ipucu_getir(uuid, double precision, double precision) from public, anon;
revoke execute on function public.hediye_al(text, double precision, double precision) from public, anon;
revoke execute on function public.cuzdan() from public, anon;
revoke execute on function public.kalp_ver(uuid) from public, anon;
revoke execute on function public.cek_sonucu(uuid, boolean) from public, anon;
revoke execute on function public.bildir(uuid) from public, anon;
revoke execute on function public.ipucu_foto_izinli(text) from public, anon;
revoke execute on function public.kafe_listesi() from public, anon;
revoke execute on function public.gorevli_ol(uuid, text) from public, anon;
revoke execute on function public.kafem() from public, anon;
revoke execute on function public.kupon_olustur(text) from public, anon;
revoke execute on function public.kupon_kullan(text) from public, anon;
revoke execute on function public.kafe_kuponlari() from public, anon;

grant execute on function public.oyuncu_bilgisi() to authenticated;
grant execute on function public.oyuncu_olustur(text) to authenticated;
grant execute on function public.hediye_sakla(text, double precision, double precision, text, text, text, text, text, text) to authenticated;
grant execute on function public.yakin_hediyeler(double precision, double precision) to authenticated;
grant execute on function public.ipucu_getir(uuid, double precision, double precision) to authenticated;
grant execute on function public.hediye_al(text, double precision, double precision) to authenticated;
grant execute on function public.cuzdan() to authenticated;
grant execute on function public.kalp_ver(uuid) to authenticated;
grant execute on function public.cek_sonucu(uuid, boolean) to authenticated;
grant execute on function public.bildir(uuid) to authenticated;
grant execute on function public.ipucu_foto_izinli(text) to authenticated;  -- Storage politikası çağırır
grant execute on function public.kafe_listesi() to authenticated;
grant execute on function public.gorevli_ol(uuid, text) to authenticated;
grant execute on function public.kafem() to authenticated;
grant execute on function public.kupon_olustur(text) to authenticated;
grant execute on function public.kupon_kullan(text) to authenticated;
grant execute on function public.kafe_kuponlari() to authenticated;
