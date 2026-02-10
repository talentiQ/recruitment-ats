// app/tl/candidates/[id]/page.tsx
'use client'

// TL views same candidate details as recruiter
// Just redirect to keep DRY for now, or copy the recruiter detail page

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function TLCandidateDetailPage() {
  const params = useParams()
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to recruiter view (works because of RLS policies)
    router.push(`/recruiter/candidates/${params.id}`)
  }, [params, router])

  return null
}