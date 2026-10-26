-- ========================================================
-- CANLI YAYIN MODÜLÜ TABLOSU VE İZİNLERİ
-- ========================================================

-- 1. Canlı Yayınlar Tablosu
CREATE TABLE IF NOT EXISTS public.live_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Canlı Yayın',
    is_live BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Hızlı sorgulamalar için indeks
CREATE INDEX IF NOT EXISTS idx_live_streams_host_is_live ON public.live_streams(host_id, is_live);

-- 2. RLS (Row Level Security) Aç
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;

-- Politikalar:
-- Herkes aktif/geçmiş yayınları görebilsin (Takipçi kontrolü yayına katılma anında yapılır)
CREATE POLICY "Herkes yayinlari gorebilir"
ON public.live_streams
FOR SELECT
USING (true);

-- Sadece oturum açmış kullanıcı kendi adına yayın açabilir
CREATE POLICY "Kullanicilar kendi yayinini olusturabilir"
ON public.live_streams
FOR INSERT
WITH CHECK (auth.uid() = host_id);

-- Sadece yayın sahibi yayın durumunu güncelleyebilir (örn. yayını bitirme)
CREATE POLICY "Kullanicilar kendi yayinini sonlandirabilir"
ON public.live_streams
FOR UPDATE
USING (auth.uid() = host_id)
WITH CHECK (auth.uid() = host_id);

-- 3. Takipçi Kontrol Fonksiyonu (ID Bazlı, Modüler)
-- Bir izleyicinin yayıncıyı takip edip etmediğini doğrulamak için fonksiyon
CREATE OR REPLACE FUNCTION public.is_user_following(p_follower_id UUID, p_host_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Eğer yayıncı kendi yayınını izliyorsa izin ver
    IF p_follower_id = p_host_id THEN
        RETURN true;
    END IF;

    -- Takip ilişkisi var mı kontrol et
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_connections
        WHERE follower_id = p_follower_id AND following_id = p_host_id
    );
END;
$$;
