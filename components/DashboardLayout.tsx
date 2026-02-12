// components/DashboardLayout.tsx
'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface User {
  id: string
  email: string
  full_name: string
  role: string
  team_id?: string
  teams?: {
    name: string
    specialization: string
  }
}

export default function DashboardLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/')
      return
    }
    setUser(JSON.parse(userData))
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/')
  }

  const getDashboardPath = () => {
    if (!user) return '/'
    if (user.role === 'recruiter') return '/recruiter/dashboard'
    if (user.role === 'team_leader') return '/tl/dashboard'
    if (['ceo', 'ops_head', 'finance_head'].includes(user.role)) return '/management/dashboard'
    return '/'
  }

  const getNavItems = () => {
    if (!user) return []
    
    if (user.role === 'recruiter') {
      return [
        { label: 'Dashboard', path: '/recruiter/dashboard' },
        { label: 'My Pipeline', path: '/recruiter/candidates' },
        { label: 'Jobs', path: '/tl/jobs' },
        { label: 'Add Candidate', path: '/recruiter/candidates/add' },
      ]
    }
    
    if (user.role === 'team_leader') {
      return [
        { label: 'Dashboard', path: '/tl/dashboard' },
        { label: 'Team Pipeline', path: '/tl/candidates' },
        { label: 'Add Candidate', path: '/tl/candidates/add' },
      ]
    }
    
    if (['ceo', 'ops_head', 'finance_head'].includes(user.role)) {
      return [
        { label: 'Dashboard', path: '/management/dashboard' },
      ]
    }
    
    return []
  }

  if (!user) return null

  const navItems = getNavItems()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              {/* Logo/Title - Click to go to dashboard */}
              <button
                onClick={() => router.push(getDashboardPath())}
                className="text-xl font-bold text-gray-900 hover:text-blue-600 transition"
              >
                Recruitment ATS
              </button>

              {/* Team Badge */}
              {user.teams && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                  {user.teams.name}
                </span>
              )}

              {/* Navigation Links */}
              <div className="hidden md:flex items-center space-x-1">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                      pathname === item.path
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user.full_name}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden pb-3 border-t border-gray-200 mt-3 pt-3">
            <div className="flex flex-col space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className={`px-3 py-2 rounded-md text-sm font-medium text-left transition ${
                    pathname === item.path
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}