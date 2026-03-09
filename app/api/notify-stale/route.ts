// app/api/notify-stale/route.ts
// Sends email notifications for stale candidates using Resend
// Install: npm install resend
// Get free API key at: https://resend.com (100 emails/day free)
// Add to .env.local: RESEND_API_KEY=re_xxxx
// Add to Vercel env vars: RESEND_API_KEY=re_xxxx

import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'TalentIQ <notifications@yourdomain.com>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://recruitment-ats.vercel.app'

interface StaleCandidate {
  id: string
  full_name: string
  current_stage: string
  days_stale: number
  job_title: string
  client_name: string
}

interface NotifyUser {
  id: string
  full_name: string
  email: string
  role: string
}

const formatStage = (stage: string) =>
  stage.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())

const getDayColor = (days: number) => {
  if (days >= 14) return '#dc2626'  // red
  if (days >= 10) return '#d97706'  // amber
  return '#2563eb'                  // blue
}

const buildRecruiterEmail = (recruiterName: string, staleCandidates: StaleCandidate[]) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  
  <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #1e40af; margin: 0; font-size: 24px;">⚡ Talent IQ</h1>
      <p style="color: #6b7280; margin: 4px 0 0;">Smart Recruitment Engine</p>
    </div>

    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 8px; color: #92400e; font-size: 16px;">⚠️ Action Required: Update Your Candidates</h2>
      <p style="margin: 0; color: #78350f; font-size: 14px;">
        Hi ${recruiterName}, the following ${staleCandidates.length} candidate${staleCandidates.length > 1 ? 's have' : ' has'} not been updated in 7+ days. Please log in and update their status.
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="text-align: left; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Candidate</th>
          <th style="text-align: left; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Current Stage</th>
          <th style="text-align: left; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Job / Client</th>
          <th style="text-align: center; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Days Stale</th>
        </tr>
      </thead>
      <tbody>
        ${staleCandidates.map(c => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 12px; font-size: 14px; font-weight: 600; color: #111827;">${c.full_name}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #6b7280;">${formatStage(c.current_stage)}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #6b7280;">${c.job_title}<br><span style="color: #9ca3af;">${c.client_name}</span></td>
          <td style="padding: 10px 12px; text-align: center;">
            <span style="background: ${getDayColor(c.days_stale)}20; color: ${getDayColor(c.days_stale)}; font-weight: 700; padding: 3px 10px; border-radius: 12px; font-size: 13px;">
              ${c.days_stale}d
            </span>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${APP_URL}" style="background: #1e40af; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
        🚀 Update Now in Talent IQ
      </a>
    </div>

    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
      This is an automated reminder from Talent IQ. Keeping candidate stages updated ensures accurate reporting and better team performance.
    </p>

  </div>
</body>
</html>
`

const buildManagerEmail = (
  managerName: string,
  recruiterName: string,
  staleCandidates: StaleCandidate[],
  managerRole: string
) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  
  <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #1e40af; margin: 0; font-size: 24px;">⚡ Talent IQ</h1>
      <p style="color: #6b7280; margin: 4px 0 0;">Smart Recruitment Engine</p>
    </div>

    <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 8px; color: #991b1b; font-size: 16px;">📋 Team Alert: Stale Candidates</h2>
      <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
        Hi ${managerName}, your team member <strong>${recruiterName}</strong> has ${staleCandidates.length} candidate${staleCandidates.length > 1 ? 's' : ''} that ${staleCandidates.length > 1 ? 'have' : 'has'} not been updated in 7+ days.
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="text-align: left; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Candidate</th>
          <th style="text-align: left; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Stage</th>
          <th style="text-align: left; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Job / Client</th>
          <th style="text-align: center; padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 2px solid #e5e7eb;">Days</th>
        </tr>
      </thead>
      <tbody>
        ${staleCandidates.map(c => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 12px; font-size: 14px; font-weight: 600; color: #111827;">${c.full_name}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #6b7280;">${formatStage(c.current_stage)}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #6b7280;">${c.job_title}<br><span style="color: #9ca3af;">${c.client_name}</span></td>
          <td style="padding: 10px 12px; text-align: center;">
            <span style="background: ${getDayColor(c.days_stale)}20; color: ${getDayColor(c.days_stale)}; font-weight: 700; padding: 3px 10px; border-radius: 12px; font-size: 13px;">
              ${c.days_stale}d
            </span>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${APP_URL}" style="background: #dc2626; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
        👀 Review in Talent IQ
      </a>
    </div>

    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
      Talent IQ — Automated team performance alert
    </p>

  </div>
</body>
</html>
`

export async function POST(req: NextRequest) {
  try {
    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping email notifications')
      return NextResponse.json({ success: true, skipped: true, reason: 'No API key' })
    }

    const { recruiter, staleCandidates, notifyUsers } = await req.json()

    if (!staleCandidates || staleCandidates.length === 0) {
      return NextResponse.json({ success: true, sent: 0 })
    }

    const results = []

    for (const notifyUser of notifyUsers) {
      if (!notifyUser.email) continue

      const isRecruiter = notifyUser.id === recruiter.id
      const subject = isRecruiter
        ? `⚠️ Action needed: ${staleCandidates.length} candidate${staleCandidates.length > 1 ? 's' : ''} need${staleCandidates.length === 1 ? 's' : ''} updating — Talent IQ`
        : `📋 Team alert: ${recruiter.full_name} has ${staleCandidates.length} stale candidate${staleCandidates.length > 1 ? 's' : ''} — Talent IQ`

      const html = isRecruiter
        ? buildRecruiterEmail(notifyUser.full_name, staleCandidates)
        : buildManagerEmail(notifyUser.full_name, recruiter.full_name, staleCandidates, notifyUser.role)

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [notifyUser.email],
          subject,
          html,
        }),
      })

      const data = await res.json()
      results.push({ user: notifyUser.full_name, status: res.ok ? 'sent' : 'failed', data })
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    console.error('notify-stale error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}