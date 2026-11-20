-- ODTÜ Hediye Avı: ipucu fotoğrafları için Storage. 002'den sonra yapıştırılır.
--
-- * Kova özeldir (public = false); fotoğraflara herkese açık bağlantı yoktur.
-- * Yükleme: oyuncu yalnızca kendi klasörüne (<auth.uid()>/...) yükleyebilir.
-- * Okuma: kendi fotoğrafları ya da ipucu_getir() 30 m içindeyken verdiği 10 dakikalık izin
--   (public.ipucu_foto_izinli). İmzalı bağlantıyı istemci createSignedUrl ile üretir; bunun
--   için de okuma (select) politikası gerekir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ipucu-fotolari', 'ipucu-fotolari', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ipucu-fotolari: kendi klasörüne yükle" on storage.objects;
create policy "ipucu-fotolari: kendi klasörüne yükle"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ipucu-fotolari'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "ipucu-fotolari: kendi fotoğrafını ya da izinli ipucunu oku" on storage.objects;
create policy "ipucu-fotolari: kendi fotoğrafını ya da izinli ipucunu oku"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ipucu-fotolari'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or public.ipucu_foto_izinli(name)
    )
  );

-- Güncelleme ve silme politikası yok: yüklenen fotoğraf değiştirilemez, silinemez.
