import { createClient } from '@supabase/supabase-js';

// Supabase Projenizden alacağınız URL ve Anon Key buraya gelecek
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ommqgqoqytvacnfckfkx.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tbXFncW9xeXR2YWNuZmNrZmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2Mjg2ODQsImV4cCI6MjEwNzIwNDY4NH0.V2L3kfN0x0rLjJD4XkATdxCWR5FNFE7YzYUnmqWnrIc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
