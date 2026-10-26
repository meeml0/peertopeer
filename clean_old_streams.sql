-- Geçmiş testlerden açık kalan tüm hayalet yayınları sonlandır:
UPDATE public.live_streams 
SET is_live = false, ended_at = NOW() 
WHERE is_live = true;
