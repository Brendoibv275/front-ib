import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ SUPABASE CREDENCIAIS AUSENTES! Configure o .env para se conectar com o banco de dados.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
