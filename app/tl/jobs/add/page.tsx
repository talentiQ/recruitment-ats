// app/tl/jobs/add/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddJobForm from '@/components/AddJobForm'
import { useRouter } from 'next/navigation'

export default function TLAddJobPage() {
  const router = useRouter()

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900 mb-2">
            ← Back to Jobs
          </button>
          <h2 className="text-2xl font-bold text-gray-900">Add New Job</h2>
          <p className="text-gray-600">Create a job opening and assign recruiters</p>
        </div>

        <AddJobForm
          userRole="team_leader"
          successRedirect="/tl/jobs"
          assignLabel="Assign Recruiters"
        />
      </div>
    </DashboardLayout>
  )
}
