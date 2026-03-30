// app/auth/callback/page.tsx
// Handles the redirect from Supabase password reset / invite emails.
// Supabase appends #access_token=...&type=recovery to the URL.
// We extract the token, let Supabase set the session, then redirect to
// a "set new password" page.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router  = useRouter()
  const [status, setStatus] = useState<'processing' | 'set_password' | 'error'>('processing')
  const [password,    setPassword]    = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [userEmail,   setUserEmail]   = useState('')

  useEffect(() => {
    // Supabase puts tokens in the URL hash — parse them
    const hash   = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const type   = params.get('type')
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setStatus('error')
      return
    }

    // Set the session from the token in the URL
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error) { setStatus('error'); return }
        if (data.user?.email) setUserEmail(data.user.email)
        // recovery = password reset / invite
        if (type === 'recovery' || type === 'invite') {
          setStatus('set_password')
        } else {
          // Other types (email confirmation etc.) — redirect to login
          router.push('/login')
        }
      })
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPwd) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      // Also activate the user record in our users table
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        await supabase
          .from('users')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('email', user.email)
      }

      alert('✅ Password set successfully! You can now log in.')
      router.push('/login')

    } catch (err: any) {
      setError(err.message || 'Failed to set password')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Verifying your link…</p>
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid or Expired Link</h2>
          <p className="text-gray-600 mb-6">
            This password reset link has expired or is invalid.
            Please ask your administrator to send a new reset email.
          </p>
          <button onClick={() => router.push('/login')} className="btn-primary w-full">
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  // ── Set password form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full">

        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-2xl font-bold text-gray-900">Set Your Password</h2>
          {userEmail && (
            <p className="text-sm text-gray-500 mt-1">for <strong>{userEmail}</strong></p>
          )}
        </div>

        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Minimum 8 characters"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="input"
              placeholder="Re-enter your password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full mt-2"
          >
            {saving ? 'Setting password…' : '✅ Set Password & Login'}
          </button>
        </form>

        <div className="mt-4 text-xs text-gray-400 text-center">
          This link expires in 24 hours. Contact your admin if it has expired.
        </div>
      </div>
    </div>
  )
}