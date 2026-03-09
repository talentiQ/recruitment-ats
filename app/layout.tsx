// app/layout.tsx  — add suppressHydrationWarning to <html>
// This suppresses hydration mismatches caused by browser extensions
// (e.g. QuickBooks, Grammarly, etc.) that inject attributes into <html>

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Talent IQ',
  description: 'Your Smart Hiring Engine',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  )
}
