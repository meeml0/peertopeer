-- AVATARS DEPOLAMA ALANI (STORAGE BUCKET) OLUŞTURMA
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage için Okuma İzni (Herkes profil resimlerini görebilsin)
CREATE POLICY "Avatar resimleri herkese açık"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Storage için Yükleme İzni (Giriş yapan kullanıcı kendi resmini yükleyebilsin)
CREATE POLICY "Kullanıcı avatar yükleyebilir"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Storage için Güncelleme İzni
CREATE POLICY "Kullanıcı avatar güncelleyebilir"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
