// Örnek ayar dosyası. Kullanmak için bu dosyayı js/ayarlar.js adıyla kopyalayıp doldurun.
// js/ayarlar.js .gitignore'dadır, repoya girmez.
//
// Değerler: Supabase panelinde Project Settings › API Keys
//   supabaseUrl      : Project URL (https://<proje-kimliği>.supabase.co)
//   supabaseAnahtari : Publishable key (sb_publishable_...)
// Legacy "anon" anahtarı ya da secret anahtar (sb_secret_... / service_role) buraya YAZILMAZ.
// js/ayarlar.js yoksa oyun sayfaları sahte istemciyle (js/oyun/sahte-istemci.js) çalışır.

export const ayarlar = {
  supabaseUrl: 'https://PROJE-KIMLIGI.supabase.co',
  supabaseAnahtari: 'sb_publishable_BURAYA'
};
