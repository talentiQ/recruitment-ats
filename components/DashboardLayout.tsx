// components/DashboardLayout.tsx - CORRECTED WITH ACTUAL FOLDER STRUCTURE
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import NotificationBell from '@/components/NotificationBell'

interface DashboardLayoutProps {
  children: React.ReactNode
}

interface NavItem {
  name: string
  href: string
  icon: string
  description?: string
  highlight?: boolean
  badge?: string
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  const getNavigationItems = (): NavItem[] => {
    if (!user) return []

    // ========================================
    // SYSTEM ADMIN NAVIGATION
    // ========================================
    if (user.role === 'system_admin') {
      return [
        {
          name: 'Admin Dashboard',
          href: '/admin/dashboard',
          icon: '⚙️',
          description: 'System administration'
        },
        {
          name: 'User Management',
          href: '/admin/users',
          icon: '👤',
          description: 'Manage all users'
        },
        {
          name: 'System Settings',
          href: '/admin/settings',
          icon: '🔧',
          description: 'Configure system'
        },
        {
          name: 'Team Management',
          href: '/admin/teams',
          icon: '👤',
          description: 'Manage all teams'
        },
        {
          name: 'Talent Pool Search',
          href: '/search/talent-pool',
          icon: '🔍',
          description: 'Search entire organization',
          highlight: true
        }
      ]
    }

    // ========================================
    // MANAGEMENT ROLES NAVIGATION (CEO, Ops Head, Finance Head)
    // ========================================
    if (user.role === 'ceo' || user.role === 'ops_head' || user.role === 'finance_head') {
      return [
        {
          name: 'Management Dashboard',
          href: '/management/dashboard',
          icon: '📊',
          description: 'Executive overview'
        },
        {
          name: 'Pipeline Analytics',
          href: '/management/analytics',
          icon: '📈',
          description: 'Company-wide analytics'
        },
        {
          name: 'Teams Performance',
          href: '/management/teams',
          icon: '👥',
          description: 'All teams & performance'
        },
        {
          name: 'Revenue Reports',
          href: '/management/revenue',
          icon: '💰',
          description: 'Financial analytics'
        },
        {
          name: 'Talent Pool Search',
          href: '/search/talent-pool',
          icon: '🔍',
          description: 'Search entire organization',
          highlight: true,
          badge: 'NEW'
        },
        {
          name: 'Upload Resumes',
          href: '/upload-resumes',
          icon: '📤',
          description: 'Bulk upload to resume bank'
        }
      ]
    }

    // ========================================
    // OPERATIONAL ROLES NAVIGATION (Recruiters, TLs, Sr.TLs)
    // ========================================
    const rolePrefix = user.role === 'sr_team_leader' ? 'sr-tl'
                      : user.role === 'team_leader' ? 'tl'
                      : 'recruiter'

    const baseNavigation: NavItem[] = [
      {
        name: 'Dashboard',
        href: `/${rolePrefix}/dashboard`,
        icon: '📊',
        description: 'Overview & KPIs'
      },
      {
        name: 'Candidates',
        href: `/${rolePrefix}/candidates`,
        icon: '👥',
        description: 'Manage candidates'
      },
      {
        name: 'Jobs',
        href: `/${rolePrefix}/jobs`,
        icon: '💼',
        description: 'Job openings'
      },
      {
        name: 'Interviews',
        href: `/${rolePrefix}/interviews`,
        icon: '📅',
        description: 'Scheduled interviews'
      },
      {
        name: 'Talent Pool Search',
        href: '/search/talent-pool',
        icon: '🔍',
        description: 'Search entire organization',
        highlight: true,
        badge: 'NEW'
      },
      {
        name: 'Offers',
        href: `/${rolePrefix}/offers`,
        icon: '📄',
        description: 'Manage offers'
      },
    ]

    if (user.role === 'team_leader' || user.role === 'sr_team_leader') {
      baseNavigation.push({
        name: 'Team Pipeline Analytics',
        href: `/${rolePrefix}/analytics`,  // ← updated to /analytics for both TL & Sr-TL
        icon: '📈',
        description: 'Team analytics'
      })
    }

    baseNavigation.push({
      name: 'Upload Resumes',
      href: '/upload-resumes',
      icon: '📤',
      description: 'Bulk upload to resume bank'
    })

    return baseNavigation
  }

  const navigation = getNavigationItems()

  const isActive = (href: string) => {
    if (href === '/search/talent-pool' || href === '/upload-resumes') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'recruiter':       return 'Recruiter'
      case 'team_leader':     return 'Team Leader'
      case 'sr_team_leader':  return 'Senior Team Leader'
      case 'ceo':             return 'CEO'
      case 'ops_head':        return 'Operations Head'
      case 'finance_head':    return 'Finance Head'
      case 'system_admin':    return 'System Admin'
      default:                return role
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - FIXED position on desktop */}
      <aside className={`
        fixed top-0 left-0 bottom-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full flex flex-col overflow-hidden">
          {/* Logo/Brand */}
          <div className="px-6 py-6 border-b border-gray-200 flex-shrink-0">
            <h1 className="text-2xl font-bold text-blue-600">Talent IQ</h1>
            <p className="text-sm text-gray-500 mt-1">Your Smart Hiring Engine</p>
          </div>

          {/* ── User Info + Notification Bell ─────────────────────────────── */}
          <div className="px-4 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {user.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{user.full_name}</p>
                <p className="text-xs text-gray-500">{getRoleDisplayName(user.role)}</p>
              </div>
              {/* 🔔 Notification Bell — desktop */}
              <NotificationBell userId={user.id} />
            </div>
          </div>

          {/* Navigation - Scrollable */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <div className="space-y-1">
              {navigation.map((item) => {
                const active = isActive(item.href)

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center gap-3 px-3 py-3 rounded-lg transition-all
                      ${active
                        ? 'bg-blue-600 text-white shadow-md'
                        : item.highlight
                          ? 'bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 text-gray-900 hover:border-blue-400 hover:shadow-md'
                          : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className={`text-xl flex-shrink-0 ${active ? 'scale-110' : ''} transition-transform`}>
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${item.highlight && !active ? 'text-blue-900' : ''}`}>
                          {item.name}
                        </span>
                        {item.badge && (
                          <span className={`
                            px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0
                            ${active
                              ? 'bg-white text-blue-600'
                              : 'bg-blue-600 text-white'
                            }
                          `}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.description && !active && (
                        <p className={`text-xs mt-0.5 truncate ${item.highlight ? 'text-blue-700' : 'text-gray-500'}`}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </nav>

          {/* Logout - Fixed at bottom */}
          <div className="p-4 border-t border-gray-200 flex-shrink-0">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <span className="text-xl">🚪</span>
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content wrapper - PROPERLY OFFSET for sidebar */}
      <div className="lg:pl-64 min-h-screen flex flex-col">

        {/* ── Mobile header with Notification Bell ─────────────────────────── */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-blue-600">Talent IQ</h1>
            <div className="flex items-center gap-2">
              {/* 🔔 Notification Bell — mobile */}
              <NotificationBell userId={user.id} />
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                {user.full_name?.charAt(0) || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-auto py-6 px-8 border-t border-gray-200 bg-white flex-shrink-0">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
            <p>© 2026 Talent IQ. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Role: {getRoleDisplayName(user.role)}</span>
              <span>•</span>
              <span>User: {user.full_name}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
