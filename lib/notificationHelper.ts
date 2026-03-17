// lib/notificationHelper.ts
// Resolves the full reporting chain for a recruiter and bulk-inserts
// one notification row per recipient into the notifications table.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type NotificationEvent =
  | 'offer_extended'
  | 'offer_accepted'
  | 'joined'
  | 'offer_rejected'
  | 'renege'

interface NotifyParams {
  event:          NotificationEvent
  recruiterId:    string          // the user who triggered the action
  recruiterName:  string
  candidateId:    string
  candidateName:  string
}

// ── Message templates ──────────────────────────────────────────────────────

const TEMPLATES: Record<NotificationEvent, {
  type:    'celebration' | 'loss'
  title:   string
  message: (recruiter: string, candidate: string) => string
  stage:   string
}> = {
  offer_extended: {
    type:    'celebration',
    title:   '🎉 Hurray!',
    message: (r, c) => `${r} marked ${c} as Offer Extended.`,
    stage:   'offer_extended',
  },
  offer_accepted: {
    type:    'celebration',
    title:   '🎉 Hurray!',
    message: (r, c) => `${r} marked ${c} as Offer Accepted.`,
    stage:   'offer_accepted',
  },
  joined: {
    type:    'celebration',
    title:   '🎉 Hurray!',
    message: (r, c) => `${r} marked ${c} as Joined.`,
    stage:   'joined',
  },
  offer_rejected: {
    type:    'loss',
    title:   '😟 Oh no!',
    message: (r, c) => `${r} marked ${c} as Offer Rejected. Opportunity Lost.`,
    stage:   'offer_rejected',
  },
  renege: {
    type:    'loss',
    title:   '😟 Oh no!',
    message: (r, c) => `${r} marked ${c} as Renege. Opportunity Lost.`,
    stage:   'renege',
  },
}

// ── Resolve full reporting chain ───────────────────────────────────────────
// Returns all user IDs who should receive the notification:
// recruiter → their TL → their Sr.TL → all management roles

async function resolveRecipients(recruiterId: string): Promise<string[]> {
  const recipients = new Set<string>()

  // Always include the recruiter themselves
  recipients.add(recruiterId)

  // Fetch recruiter record to find their TL
  const { data: recruiter } = await supabase
    .from('users')
    .select('id, reports_to, role')
    .eq('id', recruiterId)
    .maybeSingle()

  if (!recruiter) return Array.from(recipients)

  // Walk up the chain: TL → Sr.TL
  let currentReportsTo = recruiter.reports_to
  let depth = 0

  while (currentReportsTo && depth < 3) {
    const { data: manager } = await supabase
      .from('users')
      .select('id, reports_to, role')
      .eq('id', currentReportsTo)
      .maybeSingle()

    if (!manager) break

    recipients.add(manager.id)

    // Stop walking up once we hit sr_team_leader
    if (manager.role === 'sr_team_leader') break

    currentReportsTo = manager.reports_to
    depth++
  }

  // Add all active management users
  const { data: management } = await supabase
    .from('users')
    .select('id')
    .in('role', ['ceo', 'ops_head', 'finance_head', 'system_admin'])
    .eq('is_active', true)

  ;(management || []).forEach((m: any) => recipients.add(m.id))

  return Array.from(recipients)
}

// ── Main export ────────────────────────────────────────────────────────────

export async function sendNotification(params: NotifyParams): Promise<void> {
  const { event, recruiterId, recruiterName, candidateId, candidateName } = params

  try {
    const template = TEMPLATES[event]
    const recipients = await resolveRecipients(recruiterId)

    const rows = recipients.map(userId => ({
      user_id:        userId,
      type:           template.type,
      title:          template.title,
      message:        template.message(recruiterName, candidateName),
      candidate_id:   candidateId,
      candidate_name: candidateName,
      current_stage:  template.stage,
      days_stale:     0,
      is_read:        false,
    }))

    const { error } = await supabase
      .from('notifications')
      .insert(rows)

    if (error) {
      console.error('[notificationHelper] Insert error:', error.message)
    }
  } catch (err: any) {
    // Never block the main action if notification fails
    console.error('[notificationHelper] Unexpected error:', err.message)
  }
}