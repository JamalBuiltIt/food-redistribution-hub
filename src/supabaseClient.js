import { createClient } from '@supabase/supabase-js';

// Replace these with your Supabase Project URL and Anon Key
const SUPABASE_URL = 'https://stkrnmsytynjnibezrkg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OALlYH0u3s40igTOTh7KOA_5Xb9idVd';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);