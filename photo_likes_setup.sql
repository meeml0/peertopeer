-- ================================================================
-- FOTOĞRAF BEĞENİ SİSTEMİ (PHOTO LIKES)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.photo_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id UUID REFERENCES public.user_photos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(photo_id, user_id)
);

ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photo_likes_select_all" ON public.photo_likes;
CREATE POLICY "photo_likes_select_all" 
  ON public.photo_likes FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "photo_likes_insert_own" ON public.photo_likes;
CREATE POLICY "photo_likes_insert_own" 
  ON public.photo_likes FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "photo_likes_delete_own" ON public.photo_likes;
CREATE POLICY "photo_likes_delete_own" 
  ON public.photo_likes FOR DELETE 
  USING (auth.uid() = user_id);
