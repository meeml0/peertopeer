-- ================================================================
-- 1. PROFILES TABLOSUNA BİYOGRAFİ VE DETAY ALANLARI EKLEME
-- ================================================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS status_message TEXT DEFAULT 'PulseCall kullanıyor';

-- ================================================================
-- 2. KULLANICI PROFİL FOTOĞRAFLARI TABLOSU (Vitrin / Galeri)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Güvenlik Kuralları)
ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;

-- Herkes fotoğrafları görebilir (Herkese açık profil)
CREATE POLICY "user_photos_select_all" 
  ON public.user_photos FOR SELECT 
  USING (true);

-- Sadece giriş yapan kullanıcı kendi profiline fotoğraf ekleyebilir
CREATE POLICY "user_photos_insert_own" 
  ON public.user_photos FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Sadece kullanıcı kendi fotoğrafını silebilir
CREATE POLICY "user_photos_delete_own" 
  ON public.user_photos FOR DELETE 
  USING (auth.uid() = user_id);

-- ================================================================
-- 3. STORAGE BUCKET'LARI (avatars & profile_photos)
-- ================================================================
-- Ana Avatar Bucket'ı
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Profil Vitrin Fotoğrafları Bucket'ı
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile_photos', 'profile_photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ================================================================
-- 4. STORAGE RLS (Erişim ve Yükleme Güvenlik İzinleri)
-- ================================================================
DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_avatars" ON storage.objects;
DROP POLICY IF EXISTS "public_read_profile_photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_profile_photos" ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_profile_photos" ON storage.objects;

-- 1. Avatars: Herkes okuyabilir
CREATE POLICY "public_read_avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 2. Avatars: Giriş yapan kullanıcı yükleyebilir
CREATE POLICY "authenticated_insert_avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- 3. Profile Photos: Herkes görebilir
CREATE POLICY "public_read_profile_photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile_photos');

-- 4. Profile Photos: Giriş yapan kullanıcı yükleyebilir
CREATE POLICY "authenticated_insert_profile_photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile_photos' AND auth.uid() IS NOT NULL);

-- 5. Profile Photos: Sadece sahibi silebilir
CREATE POLICY "owner_delete_profile_photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile_photos' AND auth.uid() IS NOT NULL);
