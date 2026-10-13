-- ================================================================
-- PULSCOIN SANAL BAKİYE & CÜZDAN SİSTEMİ ALTYAPISI
-- ================================================================

-- 1. Profiles tablosuna pulscoin_balance sütunu ekleme (Varsayılan: 50 hediye coin)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pulscoin_balance INTEGER DEFAULT 50;

-- Mevcut tüm kullanıcılara 50 PulsCoin hediye tanımla (varsa 0 olanları da güncelle)
UPDATE public.profiles 
SET pulscoin_balance = 50 
WHERE pulscoin_balance IS NULL;

-- 2. PulsCoin Cüzdan Hareketleri (İşlem Geçmişi) Tablosu
CREATE TABLE IF NOT EXISTS public.pulscoin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL, -- Harcamalarda eksi (-1, -5), yüklemelerde artı (+50, +100)
  transaction_type TEXT NOT NULL, -- 'welcome_bonus', 'chat_message', 'audio_call', 'video_call', 'manual_deposit'
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Güvenlik) Kuralları
ALTER TABLE public.pulscoin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulscoin_trans_select_own" ON public.pulscoin_transactions;
CREATE POLICY "pulscoin_trans_select_own" 
  ON public.pulscoin_transactions FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pulscoin_trans_insert_own" ON public.pulscoin_transactions;
CREATE POLICY "pulscoin_trans_insert_own" 
  ON public.pulscoin_transactions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- 3. Otomatik Yeni Kullanıcı Kaydında 50 PulsCoin Tanımlama Trigger'ını Güncelle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url, pulscoin_balance)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    50
  );

  -- Hoş geldin bonusu işlem kaydı
  INSERT INTO public.pulscoin_transactions (user_id, amount, transaction_type, description)
  VALUES (
    new.id,
    50,
    'welcome_bonus',
    'Hoş Geldin Hediyesi 50 PulsCoin'
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
