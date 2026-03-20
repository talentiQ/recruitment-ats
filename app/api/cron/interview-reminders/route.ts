// app/api/cron/interview-reminders/route.ts
//
// Called every 5 minutes by GitHub Actions.
// 1. Finds interviews scheduled within the next 35-45 min (today only)
// 2. Inserts notifications for recruiter + full reporting chain (always)
// 3. Marks reminder_30min_sent on the interview row (always)
// 4. Sends email via Resend (best effort — failure never blocks above steps)

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { Resend }                    from 'resend'
import { getReminderEmailHtml, getReminderSubject } from '@/lib/emailTemplates'
import { resolveRecipients }         from '@/lib/notificationHelper'

// ── Supabase client ────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Cron secret — GitHub Actions sends this in the request header ──────────
const CRON_SECRET = process.env.CRON_SECRET!

// ── Parse interview_time (varchar) into a Date ─────────────────────────────
// Handles "14:30", "2:30 PM", "10:00 AM", "9:00"
function parseInterviewDateTime(date: string, time: string): Date | null {
  try {
    const [year, month, day] = date.split('-').map(Number)
    let hours = 0, minutes = 0

    const cleaned = time.trim().toUpperCase()

    if (/AM|PM/.test(cleaned)) {
      const isPM  = cleaned.includes('PM')
      const parts = cleaned.replace(/AM|PM/g, '').trim().split(':')
      hours   = parseInt(parts[0])
      minutes = parseInt(parts[1] || '0')
      if (isPM && hours !== 12) hours += 12
      if (!isPM && hours === 12) hours = 0
    } else {
      const parts = cleaned.split(':')
      hours   = parseInt(parts[0])
      minutes = parseInt(parts[1] || '0')
    }

    const dt = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
    return isNaN(dt.getTime()) ? null : dt
  } catch {
    return null
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {

  // Verify cron secret
  const secret = request.headers.get('x-cron-secret')
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Initialise Resend inside handler so key is always fresh
  const resend = new Resend(process.env.RESEND_API_KEY!)

  // IST offset: interviews are stored in IST, server runs in UTC
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const nowUtc = new Date()
  const now    = new Date(nowUtc.getTime() + IST_OFFSET_MS)
  const nowMs  = now.getTime()

  console.log('[cron] UTC now :', nowUtc.toISOString())
  console.log('[cron] IST now :', now.toISOString().replace('T', ' ').slice(0, 19))
  console.log('[cron] nowMs   :', nowMs)

  let sent30 = 0
  let errors = 0

  try {
    // ── Fetch today's scheduled interviews only ────────────────────────────
    const today = now.toISOString().slice(0, 10)
    console.log('[cron] Querying date:', today)

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
      .in('status', ['scheduled', 'rescheduled'])
      .eq('interview_date', today)
      .eq('client_hold', false)

    console.log('[cron] Interviews fetched:', interviews?.length ?? 0)

    if (fetchError) {
      console.error('[cron] Fetch error:', fetchError.message)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!interviews || interviews.length === 0) {
      return NextResponse.json({ message: 'No upcoming interviews', sent30: 0 })
    }

    for (const interview of interviews) {
      const { interview_date, interview_time, reminder_30min_sent } = interview

      // Skip if reminder already sent
      if (reminder_30min_sent) {
        console.log(`[cron] Skipping ${interview_time} — reminder already sent`)
        continue
      }

      // Skip if no interview time stored
      if (!interview_time) {
        console.log(`[cron] Skipping interview ${interview.id} — no time stored`)
        continue
      }

      const interviewDt = parseInterviewDateTime(interview_date, interview_time)
      if (!interviewDt) {
        console.warn('[cron] Could not parse time for interview', interview.id, interview_time)
        continue
      }

      const diffMinutes = (interviewDt.getTime() - nowMs) / 60000
      console.log(`[cron] ${interview_date} ${interview_time} → interviewDt ms: ${interviewDt.getTime()} | nowMs: ${nowMs} | diff: ${diffMinutes.toFixed(1)} mins | window: 35–45`)

      // Window: 35–45 minutes away → send reminder
      if (diffMinutes < 35 || diffMinutes >= 45) continue

      // ── Build email data ─────────────────────────────────────────────────
      const recruiter = (interview as any).users
      const candidate = (interview as any).candidates
      const job       = candidate?.jobs
      const client    = job?.clients

      if (!recruiter?.email) {
        console.warn('[cron] No recruiter email for interview', interview.id)
        continue
      }

      const emailData = {
        recruiterName:   recruiter.full_name   || 'Recruiter',
        candidateName:   candidate?.full_name  || 'Candidate',
        jobTitle:        job?.job_title        || 'N/A',
        clientName:      client?.company_name  || 'N/A',
        interviewDate:   new Date(interview_date + 'T00:00:00').toLocaleDateString('en-IN', {
                           weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                         }),
        interviewTime:   interview_time,
        interviewType:   interview.interview_type   || 'Interview',
        interviewerName: interview.interviewer_name || '',
        round:           interview.interview_round  || 1,
      }

      try {
        // ── 1. Resolve full reporting chain ──────────────────────────────
        const recipients = await resolveRecipients(recruiter.id)

        // ── 2. Bulk insert notifications for all recipients (always runs) ─
        const notifRows = recipients.map(userId => ({
          user_id:        userId,
          type:           'celebration' as const,
          title:          '⏰ Interview in 30 Minutes',
          message:        `⏰ Interview in 30 minutes — ${emailData.candidateName} · ${emailData.clientName} (Round ${emailData.round})`,
          candidate_id:   candidate?.id        || null,
          candidate_name: candidate?.full_name || null,
          current_stage:  'interview_scheduled',
          days_stale:     0,
          is_read:        false,
        }))

        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifRows)

        if (notifError) {
          console.error('[cron] ⚠️ Notification insert error:', notifError.message)
        } else {
          console.log(`[cron] ✅ Notifications inserted for ${recipients.length} recipients — ${emailData.candidateName}`)
        }

        // ── 3. Mark reminder as sent (always runs) ───────────────────────
        const { error: updateError } = await supabase
          .from('interviews')
          .update({ reminder_30min_sent: true })
          .eq('id', interview.id)

        if (updateError) {
          console.error('[cron] ⚠️ Interview update error:', updateError.message)
        } else {
          console.log('[cron] ✅ reminder_30min_sent marked for interview', interview.id)
        }

        // ── 4. Send email via Resend (best effort — never blocks above) ───
        try {
          const emailResult = await resend.emails.send({
            from:    'Talent IQ <reminders@talenti.biz>',
            to:      recruiter.email,
            subject: getReminderSubject('30min', emailData.candidateName, emailData.clientName),
            html:    getReminderEmailHtml('30min', emailData),
          })
          if (emailResult.error) {
            console.error('[cron] ⚠️ Email failed:', JSON.stringify(emailResult.error))
          } else {
            console.log('[cron] ✅ Email sent id:', emailResult.data?.id)
          }
        } catch (emailErr: any) {
          console.error('[cron] ⚠️ Email exception (notifications already sent):', emailErr.message)
        }

        sent30++
        console.log(`[cron] ✅ Reminder complete for ${emailData.candidateName}`)

      } catch (err: any) {
        console.error(`[cron] ❌ Failed for interview ${interview.id}:`, err.message)
        errors++
      }
    }

    return NextResponse.json({
      message:    'Reminders processed',
      sent_30min: sent30,
      errors,
      checked:    interviews.length,
      timestamp:  now.toISOString(),
    })

  } catch (err: any) {
    console.error('[cron] Unexpected error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Allow GET for manual browser testing
export async function GET(request: NextRequest) {
  return POST(request)
}