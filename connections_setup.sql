-- ================================================================
-- 1. KULLANICI BAĞLANTILARI (CONNECTIONS / FOLLOWS) TABLOSU
-- ================================================================

CREATE TABLE IF NOT EXISTS public.user_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connections_select_all" ON public.user_connections;
CREATE POLICY "connections_select_all" 
  ON public.user_connections FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "connections_insert_own" ON public.user_connections;
CREATE POLICY "connections_insert_own" 
  ON public.user_connections FOR INSERT 
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "connections_delete_own" ON public.user_connections;
CREATE POLICY "connections_delete_own" 
  ON public.user_connections FOR DELETE 
  USING (auth.uid() = follower_id);
