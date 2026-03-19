// app/api/cron/interview-reminders/route.ts
//
// Called every 5 minutes by GitHub Actions.
// 1. Finds interviews scheduled within the next 55-65 min (1hr window)
//    or within the next 10-20 min (15min window)
// 2. Sends email to recruiter via Resend
// 3. Inserts a notification into the notifications table
// 4. Marks reminder_1hr_sent / reminder_15min_sent on the interview row
//    so it never sends twice

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { Resend }                    from 'resend'
import { getReminderEmailHtml, getReminderSubject } from '@/lib/emailTemplates'

// Use service role key so we can update interview rows
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)
console.log("RESEND KEY PREFIX:", process.env.RESEND_API_KEY?.slice(0, 5))
// Protect the endpoint — GitHub Actions sends this secret in the header
const CRON_SECRET = process.env.CRON_SECRET!

// ── Parse interview_time (varchar) into a Date ─────────────────────────────
// Handles "14:30", "2:30 PM", "10:00 AM", "9:00"
function parseInterviewDateTime(date: string, time: string): Date | null {
  try {
    const [year, month, day] = date.split('-').map(Number)
    let hours = 0, minutes = 0

    const cleaned = time.trim().toUpperCase()

    if (/AM|PM/.test(cleaned)) {
      // 12-hour format: "2:30 PM" or "10:00AM"
      const isPM  = cleaned.includes('PM')
      const parts = cleaned.replace(/AM|PM/g, '').trim().split(':')
      hours   = parseInt(parts[0])
      minutes = parseInt(parts[1] || '0')
      if (isPM && hours !== 12) hours += 12
      if (!isPM && hours === 12) hours = 0
    } else {
      // 24-hour format: "14:30" or "9:00"
      const parts = cleaned.split(':')
      hours   = parseInt(parts[0])
      minutes = parseInt(parts[1] || '0')
    }

    const dt = new Date(year, month - 1, day, hours, minutes, 0, 0)
    return isNaN(dt.getTime()) ? null : dt
  } catch {
    return null
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Verify secret
  const secret = request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now    = new Date()
  const nowMs  = now.getTime()
  let sent30 = 0
  let errors   = 0

  try {
    // ── Fetch upcoming scheduled interviews (today + tomorrow only) ──────
    const today    = now.toISOString().slice(0, 10)
    const tomorrow = new Date(nowMs + 86400000).toISOString().slice(0, 10)

    const { data: interviews, error: fetchError } = await supabase
      .from('interviews')
      .select(`
        id,
        interview_date,
        interview_time,
        interview_type,
        interview_round,
        interviewer_name,
        recruiter_id,
        reminder_30min_sent,
        candidates ( id, full_name, jobs ( job_title, clients ( company_name ) ) ),
        users!interviews_recruiter_id_fkey ( id, full_name, email )
      `)
      .eq('status', 'scheduled')
      .in('interview_date', [today, tomorrow])
      .eq('client_hold', false)

    if (fetchError) {
      console.error('[cron] Fetch error:', fetchError.message)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!interviews || interviews.length === 0) {
      return NextResponse.json({ message: 'No upcoming interviews', sent30: 0 })
    }

    for (const interview of interviews) {
      const { interview_date, interview_time, reminder_30min_sent } = interview

      // Skip if both reminders already sent
      if (reminder_30min_sent) continue

      // Skip if no interview time stored
      if (!interview_time) continue

      const interviewDt = parseInterviewDateTime(interview_date, interview_time)
      if (!interviewDt) {
        console.warn('[cron] Could not parse time for interview', interview.id, interview_time)
        continue
      }

      const diffMs      = interviewDt.getTime() - nowMs
      const diffMinutes = diffMs / 60000

      // Window: 25–35 minutes away → 30min reminder
      const needs30 = !reminder_30min_sent && diffMinutes >= 25 && diffMinutes < 35

      if (!needs30) continue

      // ── Build email data ────────────────────────────────────────────────
      const recruiter    = (interview as any).users
      const candidate    = (interview as any).candidates
      const job          = candidate?.jobs
      const client       = job?.clients

      if (!recruiter?.email) {
        console.warn('[cron] No recruiter email for interview', interview.id)
        continue
      }

      const emailData = {
        recruiterName:   recruiter.full_name  || 'Recruiter',
        candidateName:   candidate?.full_name || 'Candidate',
        jobTitle:        job?.job_title       || 'N/A',
        clientName:      client?.company_name || 'N/A',
        interviewDate:   new Date(interview_date + 'T00:00:00').toLocaleDateString('en-IN', {
                           weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                         }),
        interviewTime:   interview_time,
        interviewType:   interview.interview_type || 'Interview',
        interviewerName: interview.interviewer_name || '',
        round:           interview.interview_round || 1,
      }

      const reminderType = '30min'

      try {
        // ── Send email via Resend ─────────────────────────────────────────
        await resend.emails.send({
          from:    'Talent IQ <reminders@talenti.biz>',  // ← change to your verified domain
          to:      recruiter.email,
          subject: getReminderSubject(reminderType, emailData.candidateName, emailData.clientName),
          html:    getReminderEmailHtml(reminderType, emailData),
        })

        // ── Insert in-app notification ────────────────────────────────────
        const notifMessage = `⏰ Interview in 30 minutes — ${emailData.candidateName} · ${emailData.clientName} (Round ${emailData.round})`

        await supabase.from('notifications').insert({
          user_id:        recruiter.id,
          type:           'celebration',
          title:          '⏰ Interview in 30 Minutes',
          message:        notifMessage,
          candidate_id:   candidate?.id || null,
          candidate_name: candidate?.full_name || null,
          current_stage:  'interview_scheduled',
          days_stale:     0,
          is_read:        false,
        })

        // ── Mark reminder as sent on the interview row ────────────────────
        const updatePayload = { reminder_30min_sent: true }

        await supabase.from('interviews').update(updatePayload).eq('id', interview.id)

        sent30++

        console.log(`[cron] ✅ 30min reminder sent → ${recruiter.email} for ${emailData.candidateName}`)

      } catch (emailErr: any) {
        console.error(`[cron] ❌ Failed for interview ${interview.id}:`, emailErr.message)
        errors++
      }
    }

    return NextResponse.json({
      message: 'Reminders processed',
      sent_30min: sent30,
      errors,
      checked:     interviews.length,
      timestamp:   now.toISOString(),
    })

  } catch (err: any) {
    console.error('[cron] Unexpected error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Also allow GET so you can test it manually in the browser
export async function GET(request: NextRequest) {
  return POST(request)
}