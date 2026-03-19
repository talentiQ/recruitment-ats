// components/NotificationBell.tsx  v5
// Panel opens to the RIGHT of the bell button using position:fixed + portal.
// This solves the issue where the bell is inside a left sidebar and the panel
// was being rendered behind/under the sidebar content.

'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { playNotificationSound } from '@/lib/notificationSound'

interface Notification {
  id: string
  user_id: string
  type: 'celebration' | 'loss'
  title: string
  message: string
  candidate_id: string | null
  candidate_name: string | null
  current_stage: string | null
  is_read: boolean
  created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Notifications for candidates in these stages are excluded from the bell
// (mirrors StaleCandidatesBanner logic — terminal/final states need no action)
const TERMINAL_STAGES = [
  'joined', 'interview_rejected', 'screening_rejected',
  'renege', 'offer_accepted', 'offer_rejected', 'on_hold',
]

const PANEL_WIDTH = 380

export default function NotificationBell() {
  const [open, setOpen]                   = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userId, setUserId]               = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [panelStyle, setPanelStyle]       = useState<React.CSSProperties>({})
  const [mounted, setMounted]             = useState(false)

  const bellRef      = useRef<HTMLButtonElement>(null)
  const panelRef     = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef<number>(0)

  useEffect(() => { setMounted(true) }, [])

  // ── Load user ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem('user')
    if (raw) { try { setUserId(JSON.parse(raw).id) } catch {} }
  }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async (uid: string, isRealtime = false) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .not('current_stage', 'in', `(${TERMINAL_STAGES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) { console.error('[Bell]', error.message); return }

    const items = (data || []) as Notification[]

    if (isRealtime) {
      const unread = items.filter(n => !n.is_read).length
      if (unread > prevCountRef.current) {
        const newest = items.find(n => !n.is_read)
        playNotificationSound(newest?.type ?? 'celebration')
      }
    }

    prevCountRef.current = items.filter(n => !n.is_read).length
    setNotifications(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (userId) fetchNotifications(userId)
  }, [userId, fetchNotifications])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`notif:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'notifications', filter: `user_id=eq.${userId}`,
      }, () => fetchNotifications(userId, true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, fetchNotifications])

  // ── Bell click — position panel to the RIGHT of the bell ───────────────────
  const handleBellClick = () => {
    if (!open && bellRef.current) {
      const r   = bellRef.current.getBoundingClientRect()
      const vw  = window.innerWidth
      const vh  = window.innerHeight

      // Default: open to the right of the bell, aligned to its top
      let left = r.right + 12
      let top  = r.top

      // If panel would go off the right edge, flip to open leftward instead
      if (left + PANEL_WIDTH > vw - 16) {
        left = r.left - PANEL_WIDTH - 12
      }

      // Clamp top so panel doesn't go off bottom of viewport
      const maxTop = vh - 560 - 16
      if (top > maxTop) top = maxTop
      if (top < 8) top = 8

      setPanelStyle({
        position:  'fixed',
        top,
        left,
        width:     PANEL_WIDTH,
        maxHeight: 560,
        zIndex:    99999,
      })
    }
    setOpen(o => !o)
  }

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        bellRef.current  && !bellRef.current.contains(t) &&
        panelRef.current && !panelRef.current.contains(t)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Mark read ───────────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    prevCountRef.current = Math.max(0, prevCountRef.current - 1)
  }

  const markAllRead = async () => {
    if (!userId) return
    await supabase.from('notifications')
      .update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    prevCountRef.current = 0
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  // ── Panel (portalled into document.body) ────────────────────────────────────
  const panel = open && mounted && createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className="flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <span className="font-bold text-gray-900 text-base">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
              {unreadCount} new
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-3xl mb-2">🔕</div>
            <p className="text-gray-500 text-sm">No notifications yet</p>
          </div>
        ) : (
          <ul>
            {notifications.map(n => (
              <li
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={`px-4 py-3 border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
                  n.is_read
                    ? 'bg-white hover:bg-gray-50'
                    : n.type === 'celebration'
                      ? 'bg-green-50 hover:bg-green-100'
                      : 'bg-red-50 hover:bg-red-100'
                }`}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>

                  {/* Icon */}
                  <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
                    {n.type === 'celebration' ? '🎉' : '😟'}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Title + time */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: n.type === 'celebration' ? '#166534' : '#991b1b',
                      }}>
                        {n.title}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        color: '#9ca3af',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>

                    {/* Full message — all inline styles, nothing can clip this */}
                    <p style={{
                      margin: 0,
                      fontSize: '0.875rem',
                      lineHeight: 1.45,
                      color: '#374151',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      overflow: 'visible',
                      display: 'block',
                    }}>
                      {n.message}
                    </p>

                    {/* Stage pill */}
                    {n.current_stage && (
                      <span style={{
                        display: 'inline-block',
                        marginTop: 6,
                        padding: '2px 8px',
                        borderRadius: 9999,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: n.type === 'celebration' ? '#dcfce7' : '#fee2e2',
                        color:      n.type === 'celebration' ? '#15803d' : '#b91c1c',
                      }}>
                        {n.current_stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <span style={{
                      width: 10, height: 10,
                      borderRadius: '50%',
                      background: '#3b82f6',
                      flexShrink: 0,
                      marginTop: 4,
                    }} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #f3f4f6',
          background: '#f9fafb',
          flexShrink: 0,
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''} · Click to mark read
          </p>
        </div>
      )}
    </div>,
    document.body
  )

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={bellRef}
        onClick={handleBellClick}
        type="button"
        aria-label="Notifications"
        style={{
          position: 'relative',
          padding: 8,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 24, lineHeight: 1, userSelect: 'none' }}>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 2, right: 2,
            minWidth: 18, height: 18,
            padding: '0 4px',
            background: '#ef4444',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: 700,
            borderRadius: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {panel}
    </div>
  )
}