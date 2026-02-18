// app/page.tsx
'use client'
import { useSearchParams } from "next/navigation";
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

 const handleSignIn = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) throw authError

    // Get user from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (userError) throw userError

    localStorage.setItem('user', JSON.stringify(userData))

    console.log('🎯 Redirecting user with role:', userData.role)

if (userData.role === 'system_admin') {
  console.log('➡️ Redirecting to /admin/dashboard')
  router.push('/admin/dashboard')
} else if (userData.role === 'sr_team_leader') {
  console.log('➡️ Redirecting to /sr-tl/dashboard')
  router.push('/sr-tl/dashboard')
} else if (userData.role === 'team_leader') {
  console.log('➡️ Redirecting to /tl/dashboard')
  router.push('/tl/dashboard')
} else if (userData.role === 'recruiter') {
  console.log('➡️ Redirecting to /recruiter/dashboard')
  router.push('/recruiter/dashboard')
} else if (userData.role === 'ceo' || userData.role === 'ops_head') {
  console.log('➡️ Redirecting to /management/dashboard')
  router.push('/management/dashboard')
} else {
  throw new Error('Invalid user role: ' + userData.role)
}

  } catch (error: any) {
    console.error('Sign in error:', error)
    setError(error.message)
  } finally {
    setLoading(false)
  }
}
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Talent IQ - Your Smart Hiring Platform</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        </div>
    </div>
  )
}