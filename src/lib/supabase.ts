/**
 * Supabase クライアント（認証＋データアクセス）。
 * URL / anon key は .env（VITE_SUPABASE_*）から読み込む。anon key は公開前提で、
 * データ保護は DB 側の Row Level Security が担保する。
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 設定が揃っているか（未設定ならログイン不可のガードに使う）。 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
