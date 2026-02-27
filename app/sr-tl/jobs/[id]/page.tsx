'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SrTLJobDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [job, setJob] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      loadJob(params.id as string)
    }
  }, [params.id])

  const loadJob = async (id: string) => {
    setLoading(true)

    const { data } = await supabase
      .from('jobs')
      .select(`*, clients(company_name)`)
      .eq('id', id)
      .single()

    setJob(data)

    const { data: assignmentData } = await supabase
      .from('job_recruiter_assignments')
      .select(`
        id,
        recruiter_id,
        positions_allocated,
        users:recruiter_id(full_name)
      `)
      .eq('job_id', id)
      .eq('is_active', true)

    setAllocations(assignmentData || [])

    const { data: teamData } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('is_active', true)
      .eq('role', 'recruiter')

    setTeamMembers(teamData || [])

    setLoading(false)
  }

  const removeRecruiter = async (assignmentId: string) => {
    await supabase
      .from('job_recruiter_assignments')
      .update({ is_active: false })
      .eq('id', assignmentId)

    loadJob(params.id as string)
  }

  const addRecruiter = async (recruiterId: string) => {
    await supabase.from('job_recruiter_assignments').insert([
      {
        job_id: params.id,
        recruiter_id: recruiterId,
        is_active: true,
        positions_allocated: 1,
      },
    ])

    loadJob(params.id as string)
  }

  if (loading || !job) return null

  // Pipeline %
  const progress =
    job.positions > 0
      ? (job.positions_filled / job.positions) * 100
      : 0

  // Revenue Projection
  const avgCTC = (job.min_ctc + job.max_ctc) / 2
  const billingPercent = 8 // you can later store in DB
  const projectedRevenueLakhs =
    (avgCTC * job.positions * billingPercent) / 100

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Job Header */}
        <div className="card">
          <h2 className="text-2xl font-bold">{job.job_title}</h2>
          <p className="text-gray-600">{job.clients?.company_name}</p>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>📍 {job.location}</div>
            <div>💰 ₹{job.min_ctc}-{job.max_ctc}L</div>
            <div>📅 {job.experience_min}-{job.experience_max} yrs</div>
            <div>🎯 {job.positions_filled}/{job.positions} Positions Filled</div>
          </div>
        </div>

        {/* Pipeline Progress */}
        <div className="card">
          <h3 className="font-semibold mb-2">Pipeline Progress</h3>
          <div className="w-full bg-gray-200 rounded-full h-6">
            <div
              className="bg-green-600 h-6 rounded-full text-white text-center text-sm"
              style={{ width: `${progress}%` }}
            >
              {Math.round(progress)}%
            </div>
          </div>
        </div>

        {/* Revenue Projection */}
        <div className="card bg-yellow-50 border border-yellow-300">
          <h3 className="font-semibold mb-2">Projected Revenue</h3>
          <div className="text-2xl font-bold text-yellow-800">
            ₹ {(projectedRevenueLakhs * 100000).toLocaleString('en-IN')}
          </div>
          <div className="text-sm text-gray-600">
            Based on avg CTC & {billingPercent}% billing
          </div>
        </div>

        {/* Recruiter Allocation */}
        <div className="card">
          <h3 className="font-semibold mb-4">Recruiter Allocation</h3>

          {allocations.map(a => (
            <div
              key={a.id}
              className="flex justify-between items-center border-b py-2"
            >
              <div>
                {a.users?.full_name} ({a.positions_allocated} positions)
              </div>
              <button
                onClick={() => removeRecruiter(a.id)}
                className="text-red-600 text-sm"
              >
                Remove
              </button>
            </div>
          ))}

          <div className="mt-4">
            <select
              onChange={e => addRecruiter(e.target.value)}
              className="input"
            >
              <option value="">Add Recruiter</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() =>
              router.push(`/sr-tl/candidates?jobId=${job.id}`)
            }
            className="btn-primary"
          >
            View Candidates
          </button>

          <button
            onClick={() =>
              router.push(`/sr-tl/jobs/${job.id}/add-candidate`)
            }
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            + Add Candidate
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}