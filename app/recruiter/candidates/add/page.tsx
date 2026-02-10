// app/recruiter/candidates/add/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'

export default function RecruiterAddCandidatePage() {
  return (
    <DashboardLayout>
      <AddCandidateForm userRole="recruiter" />
    </DashboardLayout>
  )
}