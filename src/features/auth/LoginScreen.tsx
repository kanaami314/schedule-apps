/**
 * 未ログイン時に表示するログイン画面。Google ログインのみ提供する。
 */
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'

export function LoginScreen() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const signingIn = useAuthStore((s) => s.signingIn)
  const [error, setError] = useState<string | null>(null)

  async function onSignIn() {
    setError(null)
    try {
      await signInWithGoogle()
    } catch {
      setError('ログインを開始できませんでした。時間をおいて再度お試しください。')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6">
      <h1 className="sr-only">くるリズム</h1>
      <div className="w-full rounded-lg border border-gray-200 bg-white/80 p-8 text-center shadow-sm">
        <img
          src={`${import.meta.env.BASE_URL}logo-lockup.svg`}
          alt="くるリズム 暮らしに合わせる自動スケジューラ"
          className="mx-auto mb-6 h-16 w-auto max-w-full"
        />
        <p className="mb-6 text-sm text-gray-600">
          ログインすると、どの端末・ブラウザでも同じデータを使えます。
        </p>
        <button
          onClick={onSignIn}
          disabled={signingIn}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.6 30.3 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16z" />
            <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.9-6.1C1 16.9 0 20.3 0 24s1 7.1 2.6 10.2l7.9-5.5z" />
            <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.1-5.5c-2 1.3-4.6 2.1-8.4 2.1-6.3 0-11.7-3.7-13.5-9.8l-7.9 5.5C6.4 42.6 14.6 48 24 48z" />
          </svg>
          {signingIn ? 'ログイン中…' : 'Google でログイン'}
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
