// lib/staleChecker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Runs on every login.
// 1. Finds candidates not updated in STALE_DAYS for the logged-in recruiter
// 2. Creates in-app notifications for recruiter + TL + Sr-TL
// 3. Calls /api/notify-stale to send emails
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'

const STALE_DAYS = 7

// Stages that are "done" — don't alert on these
const TERMINAL_STAGES = ['joined', 'rejected', 'dropped', 'renege', 'renege_dropped', 'on_hold']

export interface StaleCandidate {
  id: string
  full_name: string
  current_stage: string
  last_activity_date: string
  days_stale: number
  job_title: string
  client_name: string
}

export const runStaleCheck = async (loggedInUser: any) => {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS)

    // ── 1. Find stale candidates assigned to this recruiter ─────────────────
    const { data: staleCandidates, error } = await supabase
      .from('candidates')
      .select(`
        id, full_name, current_stage, last_activity_date,
        jobs (job_title, clients (company_name))
      `)
      .eq('assigned_to', loggedInUser.id)
      .not('current_stage', 'in', `(${TERMINAL_STAGES.map(s => `"${s}"`).join(',')})`)
      .lt('last_activity_date', cutoffDate.toISOString())
      .order('last_activity_date', { ascending: true })

    if (error) {
      console.error('Stale check error:', error)
      return
    }

    if (!staleCandidates || staleCandidates.length === 0) return

    const now = new Date()
    const enriched: StaleCandidate[] = staleCandidates.map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      current_stage: c.current_stage,
      last_activity_date: c.last_activity_date,
      days_stale: Math.floor((now.getTime() - new Date(c.last_activity_date).getTime()) / (1000 * 60 * 60 * 24)),
      job_title: c.jobs?.job_title || 'N/A',
      client_name: c.jobs?.clients?.company_name || 'N/A',
    }))

    // ── 2. Resolve hierarchy: TL + Sr-TL ───────────────────────────────────
    const notifyUserIds: string[] = [loggedInUser.id]

    // Get TL (reports_to of recruiter)
    let tlId: string | null = loggedInUser.reports_to || null
    let srTlId: string | null = null

    if (tlId) {
      notifyUserIds.push(tlId)

      // Get Sr-TL (reports_to of TL)
      const { data: tlData } = await supabase
        .from('users')
        .select('reports_to')
        .eq('id', tlId)
        .single()

      srTlId = tlData?.reports_to || null
      if (srTlId) notifyUserIds.push(srTlId)
    }

    // ── 3. Get email addresses for notification ─────────────────────────────
    const { data: notifyUsers } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('id', notifyUserIds)

    // ── 4. Create in-app notifications (deduplicate: 1 per candidate per user per day) ──
    const today = new Date().toISOString().slice(0, 10)

    for (const candidate of enriched) {
      for (const userId of notifyUserIds) {
        // Check if notification already sent today for this candidate+user
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('candidate_id', candidate.id)
          .eq('type', 'stale_candidate')
          .gte('created_at', `${today}T00:00:00`)
          .single()

        if (existing) continue // Already notified today

        const isRecruiter = userId === loggedInUser.id
        const title = isRecruiter
          ? `⚠️ Update needed: ${candidate.full_name}`
          : `⚠️ Stale candidate alert: ${candidate.full_name}`

        const message = isRecruiter
          ? `${candidate.full_name} has been in "${formatStage(candidate.current_stage)}" for ${candidate.days_stale} days. Please update their status.`
          : `${loggedInUser.full_name}'s candidate ${candidate.full_name} has been in "${formatStage(candidate.current_stage)}" for ${candidate.days_stale} days without an update.`

        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'stale_candidate',
          title,
          message,
          candidate_id: candidate.id,
          candidate_name: candidate.full_name,
          days_stale: candidate.days_stale,
          current_stage: candidate.current_stage,
          is_read: false,
        })
      }
    }

    // ── 5. Send emails via API route ────────────────────────────────────────
    if (notifyUsers && notifyUsers.length > 0) {
      await fetch('/api/notify-stale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recruiter: loggedInUser,
          staleCandidates: enriched,
          notifyUsers,
        }),
      })
    }

    return enriched
  } catch (err) {
    console.error('runStaleCheck failed:', err)
  }
}

export const formatStage = (stage: string) =>
  stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())