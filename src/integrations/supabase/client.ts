import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Read from .env.local (see .env.example). Only the public (publishable) key goes here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY manquant. Copiez .env.example en .env.local et remplissez-le."
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
