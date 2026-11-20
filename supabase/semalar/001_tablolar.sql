-- ODTÜ Hediye Avı: tablolar (docs/PLAN.md 4.3, docs/UYGULAMA.md §3.B)
-- Supabase SQL Editor'e 001 → 004 sırasıyla yapıştırılır.
--
-- Projede "yeni tablolara otomatik API erişimi" kapalı, "yeni tablolarda otomatik RLS" açık.
-- Yine de her şey burada açıkça yazılır:
--   * Her tabloda RLS açık ve hiç politika yok: anon ve authenticated rolleri tablolara
--     doğrudan erişemez. Bütün okuma/yazma 002'deki security definer fonksiyonlarla yapılır.
--   * Tablolar ve diziler üzerindeki bütün yetkiler anon, authenticated ve public'ten alınır.

create extension if not exists pgcrypto with schema extensions;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------- oyun ayarları
-- Tek satırlık tablo. Pazar demosu için:
--   update public.oyun_ayarlari set gorunme_gecikmesi_dk = 0;
create table public.oyun_ayarlari (
  id boolean primary key default true check (id),
  gorunme_gecikmesi_dk integer not null default 30 check (gorunme_gecikmesi_dk >= 0),
  gece_gizle boolean not null default true   -- 22:00-07:00 (İstanbul) arası hediyeler gösterilmez
);
insert into public.oyun_ayarlari (id) values (true);

-- ---------------------------------------------------------------- oyuncular
create table public.oyuncular (
  id uuid primary key references auth.users (id) on delete cascade,
  takma_ad text not null check (char_length(takma_ad) between 2 and 24),
  acilim integer not null default 0 check (acilim >= 0),   -- kazanılmış ek hediye görüşü
  kalp_odulleri integer not null default 0,                -- verilmiş kalp ödülü sayısı (her 5 kalpte bir)
  altin_kapali boolean not null default false,             -- 3 "çek çalışmadı" şikâyetinde açılır
  olusturma timestamptz not null default now()
);

-- ---------------------------------------------------------------- kafeler
create table public.kafeler (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  osm_id bigint,
  enlem double precision,
  boylam double precision,
  panel_sifresi_ozeti text not null   -- extensions.crypt(sifre, extensions.gen_salt('bf'))
);

-- Bir oturum en fazla bir kafenin görevlisidir. Görevlinin oyuncu satırı olması gerekmez.
create table public.kafe_gorevlileri (
  kullanici_id uuid primary key references auth.users (id) on delete cascade,
  kafe_id uuid not null references public.kafeler (id) on delete cascade,
  baslama timestamptz not null default now()
);

-- ---------------------------------------------------------------- kuponlar (gümüş)
create table public.kuponlar (
  id uuid primary key default gen_random_uuid(),
  kafe_id uuid not null references public.kafeler (id) on delete cascade,
  urun text not null check (char_length(urun) between 1 and 60),
  kod_ozeti text not null unique,                 -- MGK1 kodunun SHA-256 özeti (hex)
  kullanim_kodu text not null unique check (kullanim_kodu ~ '^[A-Z0-9]{6}$'),
  durum text not null default 'hazir'
    check (durum in ('hazir', 'saklandi', 'bulundu', 'kullanildi')),
  olusturan uuid references auth.users (id) on delete set null,
  olusturma timestamptz not null default now(),
  saklanma timestamptz,
  bulunma timestamptz,
  kullanilma timestamptz
);
create index kuponlar_kafe_idx on public.kuponlar (kafe_id, olusturma desc);

-- ---------------------------------------------------------------- hediyeler
create table public.hediyeler (
  id uuid primary key default gen_random_uuid(),
  saklayan uuid not null references public.oyuncular (id) on delete cascade,
  seviye text not null check (seviye in ('kar', 'gumus', 'altin')),
  qr_ozeti text not null unique,                  -- MGH1 kodunun SHA-256 özeti (hex)
  enlem double precision not null,
  boylam double precision not null,
  gosterim_enlem double precision not null,       -- 0-15 m kaydırılmış
  gosterim_boylam double precision not null,
  ipucu_metni text not null check (char_length(ipucu_metni) between 3 and 280),
  ipucu_foto text,                                -- Storage yolu: ipucu-fotolari/<uid>/<dosya>
  not_metni text check (char_length(not_metni) <= 1000),
  kupon_id uuid unique references public.kuponlar (id),
  cek_markasi text check (char_length(cek_markasi) <= 60),
  cek_kodu text check (char_length(cek_kodu) <= 200),
  cek_sonucu boolean,                             -- altın: bulan "çalıştı/çalışmadı" dedi mi
  durum text not null default 'saklandi' check (durum in ('saklandi', 'bulundu', 'gizlendi')),
  bulan uuid references public.oyuncular (id) on delete set null,
  saklanma_zamani timestamptz not null default now(),
  gorunme_zamani timestamptz not null,
  bulunma_zamani timestamptz,
  check (seviye <> 'kar' or not_metni is not null),
  check (seviye <> 'gumus' or kupon_id is not null),
  check (seviye <> 'altin' or (cek_markasi is not null and cek_kodu is not null))
);
create index hediyeler_gorunur_idx on public.hediyeler (durum, gorunme_zamani);
create index hediyeler_saklayan_idx on public.hediyeler (saklayan, saklanma_zamani desc);
create index hediyeler_bulan_idx on public.hediyeler (bulan);

-- ---------------------------------------------------------------- kalpler, şikâyetler
create table public.kalpler (
  hediye_id uuid not null references public.hediyeler (id) on delete cascade,
  oyuncu_id uuid not null references public.oyuncular (id) on delete cascade,
  zaman timestamptz not null default now(),
  primary key (hediye_id, oyuncu_id)
);

create table public.sikayetler (
  id bigint generated always as identity primary key,
  hediye_id uuid not null references public.hediyeler (id) on delete cascade,
  oyuncu_id uuid not null references public.oyuncular (id) on delete cascade,
  tur text not null check (tur in ('uygunsuz', 'cek_calismadi')),
  zaman timestamptz not null default now(),
  unique (hediye_id, oyuncu_id, tur)
);

-- ---------------------------------------------------------------- ipucu fotoğrafı izinleri
-- ipucu_getir() 30 m içindeki oyuncuya 10 dakikalık okuma izni yazar; Storage politikası
-- (003) buna bakar, imzalı bağlantıyı istemci üretir. Konum saklanmaz.
create table public.ipucu_erisimleri (
  oyuncu_id uuid not null references public.oyuncular (id) on delete cascade,
  hediye_id uuid not null references public.hediyeler (id) on delete cascade,
  bitis timestamptz not null,
  primary key (oyuncu_id, hediye_id)
);

-- ---------------------------------------------------------------- yasak bölgeler
-- Kaba dikdörtgenler (lojmanlar, konutlar, yurtlar). Tohum verisi 004'te.
create table public.yasak_bolgeler (
  id bigint generated always as identity primary key,
  ad text not null,
  guney double precision not null,
  bati double precision not null,
  kuzey double precision not null,
  dogu double precision not null,
  check (guney < kuzey and bati < dogu)
);

-- ---------------------------------------------------------------- RLS ve yetkiler
alter table public.oyun_ayarlari    enable row level security;
alter table public.oyuncular        enable row level security;
alter table public.kafeler          enable row level security;
alter table public.kafe_gorevlileri enable row level security;
alter table public.kuponlar         enable row level security;
alter table public.hediyeler        enable row level security;
alter table public.kalpler          enable row level security;
alter table public.sikayetler       enable row level security;
alter table public.ipucu_erisimleri enable row level security;
alter table public.yasak_bolgeler   enable row level security;

-- Politika yok: doğrudan tablo erişimi tamamen kapalı. Yetkiler de açıkça alınır.
revoke all on table public.oyun_ayarlari    from public, anon, authenticated;
revoke all on table public.oyuncular        from public, anon, authenticated;
revoke all on table public.kafeler          from public, anon, authenticated;
revoke all on table public.kafe_gorevlileri from public, anon, authenticated;
revoke all on table public.kuponlar         from public, anon, authenticated;
revoke all on table public.hediyeler        from public, anon, authenticated;
revoke all on table public.kalpler          from public, anon, authenticated;
revoke all on table public.sikayetler       from public, anon, authenticated;
revoke all on table public.ipucu_erisimleri from public, anon, authenticated;
revoke all on table public.yasak_bolgeler   from public, anon, authenticated;

revoke all on sequence public.sikayetler_id_seq     from public, anon, authenticated;
revoke all on sequence public.yasak_bolgeler_id_seq from public, anon, authenticated;
