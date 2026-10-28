/**
 * Barber Studio — Supabase Configuration
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://bplwolsslgqvymcddowc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_qkLGh67GP5LwupIyt2V_GQ__MRhFfiN';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});


export const SUPABASE_ENABLED = true;
