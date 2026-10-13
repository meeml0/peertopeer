-- 1. CALL LOGS TABLOSU (Arama Geçmişi)
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  call_type TEXT DEFAULT 'video', -- 'video' veya 'audio'
  status TEXT DEFAULT 'completed', -- 'completed', 'missed', 'rejected'
  duration INTEGER DEFAULT 0, -- saniye cinsinden
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_logs_select_own" 
  ON public.call_logs FOR SELECT 
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE POLICY "call_logs_insert_own" 
  ON public.call_logs FOR INSERT 
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id);
