// components/DashboardLayout.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import NotificationBell from '@/components/NotificationBell'
import { supabase } from '@/lib/supabase'

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

// ── Attendance quick-action button (sidebar) ──────────────────────────────────

function AttendanceButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [signedIn, setSignedIn]   = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [elapsed, setElapsed]     = useState<string>('')
  const [signInTs, setSignInTs]   = useState<string | null>(null)

  function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  }
  function toIST(d: Date) {
    return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  }
  function getHourDecimal(d: Date) {
    const ist = toIST(d)
    return ist.getHours() + ist.getMinutes() / 60
  }

  const loadStatus = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_logs')
      .select('sign_in_time,sign_out_time')
      .eq('user_id', userId)
      .eq('date', todayIST())
      .single()
    if (data?.sign_in_time) {
      setSignedIn(true)
      setSignInTs(data.sign_in_time)
    }
    if (data?.sign_out_time) setSignedOut(true)
  }, [userId])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Live elapsed timer
  useEffect(() => {
    if (!signedIn || signedOut || !signInTs) return
    const tick = () => {
      const ms = Date.now() - new Date(signInTs).getTime()
      const h  = Math.floor(ms / 3600000)
      const m  = Math.floor((ms % 3600000) / 60000)
      setElapsed(`${h}h ${m}m`)
    }
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [signedIn, signedOut, signInTs])

  const handleSignIn = async () => {
    setLoading(true)
    try {
      const now  = new Date()
      const hour = getHourDecimal(now)
      const monthStart = `${todayIST().slice(0, 7)}-01`

      const { count: lateCount } = await supabase
        .from('attendance_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_late_arrival', true)
        .gte('date', monthStart)
        .lt('date', todayIST())

      const isLate      = hour > 9.5
      const isHalfDayIn = hour > 11.5 || (isLate && (lateCount || 0) >= 3)

      await supabase.from('attendance_logs').upsert({
        user_id: userId,
        date: todayIST(),
        sign_in_time: now.toISOString(),
        status: 'pending',
        is_late_arrival: isLate,
        is_half_day_in: isHalfDayIn,
        late_count_this_month: lateCount || 0,
        required_hours: 9,
        updated_at: now.toISOString(),
      }, { onConflict: 'user_id,date' })

      setSignedIn(true)
      setSignInTs(now.toISOString())

      if (isHalfDayIn) alert('⚠️ Signed in after 11:30 AM — marked as Half Day.')
      else if (isLate)  alert('⏰ Late arrival noted.')
    } catch (err: any) {
      alert('Sign in failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    setLoading(true)
    try {
      const now      = new Date()
      const hour     = getHourDecimal(now)
      const worked   = signInTs ? (now.getTime() - new Date(signInTs).getTime()) / 3600000 : 0
      const isHalfOut = hour < 16.0
      const isHalf    = isHalfOut

      if (worked < 8.75) {
        const ok = confirm(`⚠️ Only ${Math.floor(worked)}h ${Math.round((worked % 1) * 60)}m worked of 9h required.\n\nSign out anyway?`)
        if (!ok) { setLoading(false); return }
      }

      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id, is_half_day_in')
        .eq('user_id', userId)
        .eq('date', todayIST())
        .single()

      if (existing) {
        await supabase.from('attendance_logs').update({
          sign_out_time: now.toISOString(),
          hours_worked: Math.round(worked * 100) / 100,
          hours_deficit: Math.max(0, Math.round((9 - worked) * 100) / 100),
          is_early_leave: hour < 16.5,
          is_half_day_out: isHalfOut,
          is_half_day: isHalf || existing.is_half_day_in,
          status: (isHalf || existing.is_half_day_in) ? 'half_day' : 'present',
          updated_at: now.toISOString(),
        }).eq('id', existing.id)
      }

      setSignedOut(true)
    } catch (err: any) {
      alert('Sign out failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Navigate to full attendance page on click (if already signed in/out)
  const goToAttendance = () => {
    window.location.href = '/attendance'
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (signedIn && signedOut) {
    return (
      <button onClick={goToAttendance}
        className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold border-2 border-green-400 bg-green-50 text-green-800 hover:bg-green-100 transition">
        ✅ Attendance Recorded
      </button>
    )
  }

  if (signedIn) {
    return (
      <div className="mt-4 space-y-2">
        {elapsed && (
          <div className="text-center text-xs text-gray-500 font-medium">
            ⏱ In office: <span className="font-bold text-green-700">{elapsed}</span>
          </div>
        )}
        <button onClick={handleSignOut} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-60">
          {loading ? 'Signing out…' : '🔴 Sign Out'}
        </button>
        <button onClick={goToAttendance}
          className="w-full text-xs text-center text-gray-400 hover:text-blue-600 transition">
          View attendance →
        </button>
      </div>
    )
  }

  return (
    <button onClick={handleSignIn} disabled={loading}
      className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-60">
      {loading ? 'Signing in…' : '🟢 Sign In'}
    </button>
  )
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const [user, setUser]             = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Roles that should show the attendance sign-in button
  const ATTENDANCE_ROLES = ['recruiter','team_leader','sr_team_leader']

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)

    if (parsedUser?.id && typeof window !== 'undefined') {
      try {
        const chrome = (window as any).chrome
        if (chrome?.storage?.local) {
          chrome.storage.local.set({ supabase_user_id: parsedUser.id })
        }
      } catch { /* extension not installed */ }
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('user')
    if (typeof window !== 'undefined') {
      try {
        const chrome = (window as any).chrome
        if (chrome?.storage?.local) chrome.storage.local.remove('supabase_user_id')
      } catch { /* safe to ignore */ }
    }
    router.push('/')
  }

  const getNavigationItems = (): NavItem[] => {
    if (!user) return []

    // ── System Admin ──────────────────────────────────────────────────────
    if (user.role === 'system_admin') {
      return [
        { name: 'Admin Dashboard',    href: '/admin/dashboard',     icon: '⚙️',  description: 'System administration' },
        { name: 'User Management',    href: '/admin/users',          icon: '👤',  description: 'Manage all users' },
        { name: 'System Settings',    href: '/admin/settings',       icon: '🔧',  description: 'Configure system' },
        { name: 'Team Management',    href: '/admin/teams',          icon: '👤',  description: 'Manage all teams' },
        { name: 'Talent Pool Search', href: '/search/talent-pool',   icon: '🔍',  description: 'Search entire organization', highlight: true },
      ]
    }

    // ── Management (CEO, Ops Head, Finance Head) ──────────────────────────
    if (['ceo','ops_head','finance_head'].includes(user.role)) {
      return [
        { name: 'Management Dashboard', href: '/management/dashboard',  icon: '📊', description: 'Executive overview' },
        { name: 'Pipeline Analytics',   href: '/management/analytics',  icon: '📈', description: 'Company-wide analytics' },
        { name: 'Teams Performance',    href: '/management/teams',       icon: '👥', description: 'All teams & performance' },
        { name: 'Candidates Management',href: '/management/candidates',  icon: '👤', description: 'Manage all candidates' },
        { name: 'Interviews Overview',  href: '/management/interviews',  icon: '📅', description: 'All interviews & scheduling' },
        { name: 'Jobs Analytics',       href: '/management/jobs',        icon: '💼', description: 'All Jobs Analytics' },
        { name: 'Offers Control',       href: '/management/offers',      icon: '💰', description: 'Offer Management' },
        { name: 'Billing & Invoices',   href: '/management/billing',     icon: '🧾', description: 'Billing & Invoices' },
        { name: 'Achievements & Rewards',href: '/achievers',             icon: '🏆', description: 'Achievers Board' },
        { name: 'Incentives & Bonuses', href: '/management/Incentives',  icon: '💰', description: 'Incentive & Bonus Management' },
        // ── Attendance ──────────────────────────────────────────────────
        { name: 'Attendance',           href: '/management/attendance',  icon: '🕐', description: 'Org attendance & holidays' },
        { name: 'Talent Pool Search',   href: '/search/talent-pool',     icon: '🔍', description: 'Search entire organization', highlight: true, badge: 'NEW' },
        { name: 'Upload Resumes',       href: '/upload-resumes',         icon: '📤', description: 'Bulk upload to resume bank' },
      ]
    }

    // ── Operational roles (Recruiter, TL, Sr. TL) ────────────────────────
    const rolePrefix = user.role === 'sr_team_leader' ? 'sr-tl'
                     : user.role === 'team_leader'     ? 'tl'
                     : 'recruiter'

    const baseNavigation: NavItem[] = [
      { name: 'Dashboard',              href: `/${rolePrefix}/dashboard`,  icon: '📊', description: 'Overview & KPIs' },
      { name: 'Candidates',             href: `/${rolePrefix}/candidates`, icon: '👥', description: 'Manage candidates' },
      { name: 'Clients',                href: `/${rolePrefix}/clients`,    icon: '🏢', description: 'Manage clients' },
      { name: 'Jobs',                   href: `/${rolePrefix}/jobs`,       icon: '💼', description: 'Job openings' },
      { name: 'Interviews',             href: `/${rolePrefix}/interviews`, icon: '📅', description: 'Scheduled interviews' },
      { name: 'Achievements & Rewards', href: '/achievers',                icon: '🏆', description: 'Achievers Board' },
      { name: 'Talent Pool Search',     href: '/search/talent-pool',       icon: '🔍', description: 'Search entire organization', highlight: true, badge: 'NEW' },
      { name: 'Offers',                 href: `/${rolePrefix}/offers`,     icon: '📄', description: 'Manage offers' },
    ]

    if (['team_leader','sr_team_leader'].includes(user.role)) {
      baseNavigation.push({
        name: 'Team Pipeline Analytics',
        href: `/${rolePrefix}/analytics`,
        icon: '📈',
        description: 'Team analytics',
      })
    }

    // ── Attendance link ───────────────────────────────────────────────────
    // Sr. TL → /sr-tl/attendance | TL & Recruiter → /attendance (personal page)
    if (user.role === 'sr_team_leader') {
      baseNavigation.push({ name: 'Attendance', href: '/sr-tl/attendance', icon: '🕐', description: 'Team attendance view' })
    } else {
      baseNavigation.push({ name: 'Attendance', href: '/attendance', icon: '🕐', description: 'My attendance & leaves' })
    }

    baseNavigation.push({
      name: 'Upload Resumes',
      href: '/upload-resumes',
      icon: '📤',
      description: 'Bulk upload to resume bank',
    })

    return baseNavigation
  }

  const navigation = getNavigationItems()

  const isActive = (href: string) => {
    if (['/search/talent-pool','/upload-resumes','/achievers','/attendance','/sr-tl/attendance','/management/attendance'].includes(href)) {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  const getRoleDisplayName = (role: string) => ({
    recruiter:      'Recruiter',
    team_leader:    'Team Leader',
    sr_team_leader: 'Senior Team Leader',
    ceo:            'CEO',
    ops_head:       'Operations Head',
    finance_head:   'Finance Head',
    system_admin:   'System Admin',
  }[role] || role)

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  )

  const showAttendanceButton = ATTENDANCE_ROLES.includes(user.role)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 bottom-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-full flex flex-col overflow-hidden">

          {/* Brand */}
          <div className="px-6 py-6 border-b border-gray-200 flex-shrink-0">
            <h1 className="text-2xl font-bold text-blue-600">Talent IQ</h1>
            <p className="text-sm text-gray-500 mt-1">Your Smart Hiring Engine</p>

            {/* ── Attendance Sign In/Out button (replaces CV Importer) ── */}
            {showAttendanceButton && (
              <AttendanceButton userId={user.id} />
            )}
          </div>

          {/* User info + bell */}
          <div className="px-4 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {user.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{user.full_name}</p>
                <p className="text-xs text-gray-500">{getRoleDisplayName(user.role)}</p>
              </div>
              <NotificationBell {...{ userId: user.id } as any} />
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <div className="space-y-1">
              {navigation.map(item => {
                const active = isActive(item.href)
                return (
                  <Link key={item.name} href={item.href}
                    className={`
                      group flex items-center gap-3 px-3 py-3 rounded-lg transition-all
                      ${active
                        ? 'bg-blue-600 text-white shadow-md'
                        : item.highlight
                          ? 'bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 text-gray-900 hover:border-blue-400 hover:shadow-md'
                          : item.href.includes('attendance')
                            ? 'text-gray-700 hover:bg-teal-50 hover:text-teal-700'
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
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0 ${active ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
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

          {/* Logout */}
          <div className="p-4 border-t border-gray-200 flex-shrink-0">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <span className="text-xl">🚪</span>
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 min-h-screen flex flex-col">

        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-blue-600">Talent IQ</h1>
            <div className="flex items-center gap-2">
              <NotificationBell {...{ userId: user.id } as any} />
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                {user.full_name?.charAt(0) || 'U'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>

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