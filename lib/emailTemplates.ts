// lib/emailTemplates.ts
// HTML email templates for interview reminder notifications

interface ReminderEmailData {
  recruiterName:    string
  candidateName:    string
  jobTitle:         string
  clientName:       string
  interviewDate:    string
  interviewTime:    string
  interviewType:    string
  interviewerName:  string
  round:            number
}

export function getReminderEmailHtml(
  type: '30min',
  data: ReminderEmailData
): string {
  const timeLabel   = 'in 30 Minutes'
  const accent      = '#d97706'
  const accentLight = '#fffbeb'
  const emoji       = '⏰'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Reminder</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:${accent};padding:24px 32px;">
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);font-weight:500;letter-spacing:0.05em;text-transform:uppercase;">
              Talent IQ · Interview Reminder
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">
              ${emoji} Interview ${timeLabel}
            </h1>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#374151;">
              Hi <strong>${data.recruiterName}</strong>,
            </p>
            <p style="margin:10px 0 0;font-size:15px;color:#374151;">
              This is a reminder that your candidate <strong>${data.candidateName}</strong> has an interview coming up <strong style="color:${accent};">${timeLabel}</strong>.
            </p>
          </td>
        </tr>

        <!-- Interview Details Card -->
        <tr>
          <td style="padding:20px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${accentLight};border:1px solid ${accent}22;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="6">
                    <tr>
                      <td style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:12px;" colspan="2">
                        Interview Details
                      </td>
                    </tr>
                    ${row('👤 Candidate',   data.candidateName)}
                    ${row('💼 Job Role',    data.jobTitle)}
                    ${row('🏢 Client',      data.clientName)}
                    ${row('📅 Date',        data.interviewDate)}
                    ${row('🕐 Time',        data.interviewTime)}
                    ${row('🔄 Round',       `Round ${data.round}`)}
                    ${row('📋 Type',        data.interviewType || 'Not specified')}
                    ${data.interviewerName ? row('👥 Interviewer', data.interviewerName) : ''}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Action reminder -->
        <tr>
          <td style="padding:0 32px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:13px;color:#6b7280;font-weight:600;margin-bottom:8px;">
                    CHECKLIST
                  </p>
                  <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                    ✓ Confirm candidate is ready and available<br>
                    ✓ Share interview link/location if not already done<br>
                    ✓ Remind candidate to keep documents ready<br>
                    ✓ Be available to support if needed
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This is an automated reminder from <strong>Talent IQ</strong>. Do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// Helper for detail rows
function row(label: string, value: string): string {
  return `
    <tr>
      <td style="font-size:13px;color:#6b7280;padding:4px 0;width:120px;vertical-align:top;">
        ${label}
      </td>
      <td style="font-size:13px;color:#111827;font-weight:600;padding:4px 0;">
        ${value}
      </td>
    </tr>`
}

export function getReminderSubject(
  type: '30min',
  candidateName: string,
  clientName: string
): string {
  return `⏰ Interview in 30 Minutes — ${candidateName} · ${clientName}`
}