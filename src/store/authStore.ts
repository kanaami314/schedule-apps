/**
 * 認証状態（Supabase Auth / Google OAuth）。
 * セッションを監視し、ログイン/ログアウトを提供する。データの読み込み自体は
 * appStore が担う（App がセッション変化に応じて appStore.init()/reset() を呼ぶ）。
 */
import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface AuthState {
  /** 現在のセッション（未ログインは null）。 */
  session: Session | null
  /** 初回のセッション判定が完了したか（起動直後のちらつき防止）。 */
  ready: boolean
  /** サインイン処理中か。 */
  signingIn: boolean
  /** セッション監視を開始する（アプリ起動時に1回）。 */
  init(): void
  /** Google でログイン（OAuth リダイレクト）。 */
  signInWithGoogle(): Promise<void>
  /** ログアウト。 */
  signOut(): Promise<void>
}

/** 本番(GitHub Pages)は base 配下、開発は / に戻す。 */
const redirectTo =
  typeof window !== 'undefined'
    ? `${window.location.origin}${import.meta.env.BASE_URL}`
    : undefined

let subscribed = false

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  ready: false,
  signingIn: false,

  init() {
    if (subscribed) return
    subscribed = true
    // 起動時の現在セッションを取得。
    supabase.auth
      .getSession()
      .then(({ data }) => set({ session: data.session, ready: true }))
      .catch(() => set({ ready: true }))
    // 以降の変化（ログイン/ログアウト/トークン更新）を監視。
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, ready: true, signingIn: false })
    })
  },

  async signInWithGoogle() {
    set({ signingIn: true })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) {
      set({ signingIn: false })
      throw error
    }
    // 成功時はリダイレクトされるため以降の処理はない。
  },

  async signOut() {
    await supabase.auth.signOut()
    set({ session: null })
  },
}))
