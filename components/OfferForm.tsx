// components/OfferForm.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Client {
  id: string
  company_name?: string
  replacement_guarantee_days?: number
}

interface Job {
  id: string
  job_title?: string
  job_code?: string
  client_id?: string
  clients?: Client
}

interface Candidate {
  id: string
  full_name?: string
  expected_ctc?: number
  notice_period?: number
  job_id?: string
  jobs?: Job
  current_stage?: string
}

interface OfferFormProps {
  candidateId?: string
  candidate?: Candidate | null
  existingOffer?: any
  isEditMode?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}

export default function OfferForm({ 
  candidateId,
  candidate: propCandidate = null,
  existingOffer, 
  isEditMode = false,
  onSuccess,
  onCancel 
}: OfferFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(propCandidate)
  const [client, setClient] = useState<Client | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    // CTC Breakdown
    fixed_ctc: existingOffer?.fixed_ctc?.toString() || '',
    variable_ctc: existingOffer?.variable_ctc?.toString() || '0',
    
    // Dates
    offer_date: existingOffer?.offer_date || new Date().toISOString().split('T')[0],
    offer_valid_until: existingOffer?.offer_valid_until || '',
    expected_joining_date: existingOffer?.expected_joining_date || '',
    
    // Job Details
    work_location: existingOffer?.work_location || '',
    designation: existingOffer?.designation || '',
    department: existingOffer?.department || '',
    reporting_to: existingOffer?.reporting_to || '',
    
    // Notes
    notes: existingOffer?.notes || '',
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    // if parent passed candidate, use it; otherwise load from ID
    if (propCandidate) {
      setCandidate(propCandidate)
      if (propCandidate.jobs?.clients) setClient(propCandidate.jobs.clients)
    } else if (candidateId) {
      loadCandidate(candidateId)
    }
  }, [candidateId])

  const loadCandidate = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            id,
            job_title,
            job_code,
            client_id,
            clients (
              id,
              company_name,
              replacement_guarantee_days
            )
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      const d = data as Candidate
      setCandidate(d)
      if (d.jobs?.clients) setClient(d.jobs.clients)

      // Pre-fill designation from job title
      if (d.jobs?.job_title && !formData.designation) {
        setFormData(prev => ({
          ...prev,
          designation: d.jobs?.job_title || prev.designation
        }))
      }
    } catch (err: unknown) {
      console.error('Error loading candidate:', err)
      setFormError('Could not load candidate')
    }
  }

  const calculateTotalCTC = () => {
    const fixed = parseFloat(formData.fixed_ctc) || 0
    const variable = parseFloat(formData.variable_ctc) || 0
    return fixed + variable
  }

  const calculateExpectedRevenue = () => {
    const fixed = parseFloat(formData.fixed_ctc) || 0
    return fixed * 0.0833  // 8.33%
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setFormError(null)
    if (!formData.fixed_ctc || !formData.expected_joining_date) {
      setFormError('Please fill Fixed CTC and Expected Joining Date')
      return
    }

    setLoading(true)

    try {
      const fixedCTC = parseFloat(formData.fixed_ctc)
      const variableCTC = parseFloat(formData.variable_ctc) || 0
      const totalCTC = fixedCTC + variableCTC
      const billableCTC = fixedCTC  // Billable = Fixed only
      const expectedRevenue = fixedCTC * 0.0833

      const offerData = {
        candidate_id: candidateId || existingOffer?.candidate_id,
        job_id: candidate?.job_id,
        recruiter_id: user.id,
        client_id: candidate?.jobs?.client_id,
        
        // CTC
        offered_ctc: totalCTC,
        fixed_ctc: fixedCTC,
        variable_ctc: variableCTC,
        billable_ctc: billableCTC,
        
        // Dates
        offer_date: formData.offer_date,
        offer_valid_until: formData.offer_valid_until || null,
        expected_joining_date: formData.expected_joining_date,
        
        // Job Details
        work_location: formData.work_location,
        designation: formData.designation,
        department: formData.department,
        reporting_to: formData.reporting_to,
        
        status: candidate?.current_stage === 'offer_accepted' ? 'accepted' : 'extended',
        notes: formData.notes,
        created_by: user.id,
      }

      if (isEditMode && existingOffer) {
        // UPDATE
        const { error } = await supabase
          .from('offers')
          .update(offerData)
          .eq('id', existingOffer.id)

        if (error) throw error

      } else {
        // CREATE
        const { data: newOffer, error } = await supabase
          .from('offers')
          .insert([offerData])
          .select()
          .single()

        if (error) throw error

        // Update candidate
        await supabase.from('candidates').update({
          current_stage: 'offer_extended',
          offered_ctc: totalCTC,
          fixed_ctc: fixedCTC,
          variable_ctc: variableCTC,
          billable_ctc: billableCTC,
        }).eq('id', candidateId)

        // Timeline
        await supabase.from('candidate_timeline').insert([{
          candidate_id: candidateId,
          activity_type: 'offer_extended',
          activity_title: 'Offer Extended',
          activity_description: `Offer of Rs.${totalCTC} extended (Fixed: Rs.${fixedCTC}, Variable: Rs.${variableCTC}). Expected revenue: Rs.${expectedRevenue.toFixed(2)}L`,
          metadata: {
            offer_id: newOffer.id,
            total_ctc: totalCTC,
            fixed_ctc: fixedCTC,
            expected_revenue: expectedRevenue
          },
          performed_by: user.id,
        }])
      }

      const successMsg = `Offer ${isEditMode ? 'updated' : 'created'} successfully!`
      setFormSuccess(successMsg)
      if (onSuccess) {
        onSuccess()
      } else {
        router.back()
      }

    } catch (err: unknown) {
      console.error('Error:', err)
      const message = err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err)
      setFormError('Error: ' + message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{formError}</div>
      )}
      {formSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded">{formSuccess}</div>
      )}
      {/* Candidate Info Banner */}
      {candidate && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-bold text-blue-900 text-lg mb-2">
            {candidate.full_name}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-600">Position:</span>
              <span className="ml-2 font-medium">{candidate.jobs?.job_title}</span>
            </div>
            <div>
              <span className="text-blue-600">Client:</span>
              <span className="ml-2 font-medium">{client?.company_name}</span>
            </div>
            <div>
              <span className="text-blue-600">Expected CTC:</span>
              <span className="ml-2 font-medium">Rs.{candidate.expected_ctc}L</span>
            </div>
            <div>
              <span className="text-blue-600">Notice Period:</span>
              <span className="ml-2 font-medium">{candidate.notice_period} days</span>
            </div>
          </div>
        </div>
      )}

      {/* CTC Breakdown */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">CTC Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fixed CTC (INR) *
            </label>
            <input
              type="number"
              step="0.1"
              name="fixed_ctc"
              value={formData.fixed_ctc}
              onChange={handleChange}
              className="input"
              placeholder="e.g., 1000000"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Billing base for revenue calculation
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Variable CTC (INR)
            </label>
            <input
              type="number"
              step="0.1"
              name="variable_ctc"
              value={formData.variable_ctc}
              onChange={handleChange}
              className="input"
              placeholder="e.g., 200000"
            />
            <p className="text-xs text-gray-500 mt-1">
              Bonus, incentives (not included in billing)
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-gray-600">Total CTC</div>
              <div className="text-2xl font-bold text-gray-900">
                Rs.{calculateTotalCTC().toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Billable CTC</div>
              <div className="text-2xl font-bold text-blue-600">
                Rs.{parseFloat(formData.fixed_ctc || '0').toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Expected Revenue</div>
              <div className="text-2xl font-bold text-green-600">
                Rs.{calculateExpectedRevenue().toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Dates</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Offer Date
            </label>
            <input
              type="date"
              name="offer_date"
              value={formData.offer_date}
              onChange={handleChange}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Offer Valid Until
            </label>
            <input
              type="date"
              name="offer_valid_until"
              value={formData.offer_valid_until}
              onChange={handleChange}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expected Joining Date *
            </label>
            <input
              type="date"
              name="expected_joining_date"
              value={formData.expected_joining_date}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
        </div>
      </div>

      {/* Job Details */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Designation
            </label>
            <input
              type="text"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              className="input"
              placeholder="e.g., Senior Software Engineer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Work Location
            </label>
            <input
              type="text"
              name="work_location"
              value={formData.work_location}
              onChange={handleChange}
              className="input"
              placeholder="e.g., Mumbai, Hybrid"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department
            </label>
            <input
              type="text"
              name="department"
              value={formData.department}
              onChange={handleChange}
              className="input"
              placeholder="e.g., Engineering, Sales"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reporting To
            </label>
            <input
              type="text"
              name="reporting_to"
              value={formData.reporting_to}
              onChange={handleChange}
              className="input"
              placeholder="e.g., VP Engineering"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h3>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="input"
          placeholder="Any special terms, conditions, or notes..."
        />
      </div>

      {/* Guarantee Period Info */}
      {client && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-2xl">!</span>
            <div>
              <h4 className="font-semibold text-yellow-900">Replacement Guarantee Period</h4>
              <p className="text-sm text-yellow-800 mt-1">
                Client: <strong>{client.company_name}</strong> has a{' '}
                <strong>{client.replacement_guarantee_days || 90} days</strong> guarantee period.
                Revenue will be provisional until this period ends.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1"
        >
          {loading ? 'Processing...' : isEditMode ? 'Update Offer' : 'Create Offer'}
        </button>
        <button
          type="button"
          onClick={onCancel || (() => router.back())}
          className="bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
