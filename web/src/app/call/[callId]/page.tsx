'use client'

// Force dynamic rendering (reads search params)
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileText, StickyNote, Volume2 } from 'lucide-react'

export default function CallDetailPage() {
  const { callId } = useParams<{ callId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const agentId = searchParams.get('agentId') || ''
  const projectId = searchParams.get('projectId') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const timeFrom = searchParams.get('timeFrom') || ''
  const timeTo = searchParams.get('timeTo') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [call, setCall] = useState<any | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [showAudio, setShowAudio] = useState(false)

  // Build back link to campaign detail with preserved filters
  const backHref = useMemo(() => {
    const sp = new URLSearchParams()
    if (dateFrom) sp.set('dateFrom', dateFrom)
    if (dateTo) sp.set('dateTo', dateTo)
    if (timeFrom) sp.set('timeFrom', timeFrom)
    if (timeTo) sp.set('timeTo', timeTo)
    if (agentId) sp.set('agentId', agentId)
    return `/dashboard/campaign/${projectId}?${sp.toString()}`
  }, [agentId, projectId, dateFrom, dateTo, timeFrom, timeTo])

  useEffect(() => {
    const fetchData = async () => {
      if (!agentId || !projectId) {
        setError('Missing agent or project')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (dateFrom) params.set('dateFrom', dateFrom)
        if (dateTo) params.set('dateTo', dateTo)
        const url = `/api/call-details/${encodeURIComponent(agentId)}/${encodeURIComponent(projectId)}?${params.toString()}`
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load call details')
        const list = await res.json()
        const found = Array.isArray(list) ? list.find((c: any) => String(c.id) === String(callId)) : null
        setCall(found || null)
      } catch (e: any) {
        setError(e?.message || 'Failed to load call')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [agentId, projectId, callId, dateFrom, dateTo])

  const startTranscription = async () => {
    if (!call?.recordingUrl) return
    setError(null)
    setTranscribing(true)
    try {
      const submit = await fetch(`/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ audioUrl: call.recordingUrl })
      })
      if (!submit.ok) {
        throw new Error('Failed to submit transcription')
      }
      const { audioFileId } = await submit.json()
      const max = 6
      for (let i = 0; i < max; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await fetch(`/api/transcribe/${audioFileId}/status`, { credentials: 'include' })
        if (!statusRes.ok) continue
        const status = await statusRes.json()
        if (status.status === 'completed' && status.transcript) { setTranscript(status.transcript); break }
        if (status.status === 'failed') { setError(status?.metadata?.error || 'Transcription failed'); break }
      }
    } catch (e: any) {
      setError(e?.message || 'Transcription error')
    } finally {
      setTranscribing(false)
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-8">
        <div className="mb-4"><a href={backHref} className="text-sm text-slate-800 hover:underline">← Back to campaign</a></div>
        <div className="bg-white rounded-lg shadow p-6 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-3 bg-slate-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (!call) {
    return (
      <div className="px-6 py-8">
        <div className="mb-4"><a href={backHref} className="text-sm text-slate-800 hover:underline">← Back to campaign</a></div>
        <div className="bg-white rounded-lg shadow p-6 text-slate-700">Call not found.</div>
      </div>
    )
  }

  const dt = new Date(call.callStart)
  const datum = isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
  const zeit = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dauerSec = Math.round(call.duration || 0)
  const dauer = `${Math.floor(dauerSec/60)}:${(dauerSec%60).toString().padStart(2,'0')}`

  return (
    <div className="px-6 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <a href={backHref} className="inline-flex items-center gap-1 text-sm text-slate-800 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to campaign
        </a>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-slate-500 text-sm">Call ID</div>
            <div className="font-mono text-slate-900 text-sm break-all">{call.id}</div>
          </div>
          <div>
            <div className="text-slate-500 text-sm">Date / Time</div>
            <div className="text-slate-900">{datum} · {zeit}</div>
          </div>
          <div>
            <div className="text-slate-500 text-sm">Duration</div>
            <div className="text-slate-900 tabular-nums">{dauer}</div>
          </div>
          <div>
            <div className="text-slate-500 text-sm">Outcome</div>
            <div className="text-slate-900">{call.outcome || '—'}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border ${call.recordingUrl ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'border-slate-200 text-slate-300 cursor-not-allowed'}`}
            onClick={() => call.recordingUrl && setShowAudio(v => !v)}
          >
            <Volume2 className="w-4 h-4" /> Audio
          </button>
          <a
            href={call.recordingUrl || '#'}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border ${call.recordingUrl ? 'border-blue-300 text-blue-700 hover:bg-blue-50' : 'border-slate-200 text-slate-300 cursor-not-allowed'}`}
          >
            <Download className="w-4 h-4" /> Download
          </a>
          <button
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border ${transcribing ? 'border-slate-200 text-slate-300' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            onClick={startTranscription}
            disabled={transcribing || !call.recordingUrl}
          >
            {transcribing ? (<span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Transcribing…</span>) : (<><FileText className="w-4 h-4" /> Transcribe</>)}
          </button>
        </div>

        {showAudio && call.recordingUrl && (
          <div className="mt-3">
            <audio controls src={call.recordingUrl} className="h-8" />
          </div>
        )}

        {call.notes && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-slate-700 mb-1"><StickyNote className="w-4 h-4" /> Notes</div>
            <div className="text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded p-3 whitespace-pre-wrap">{String(call.notes).replace(/\r\n|\n|\r/g, '\n')}</div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-600">{error}</div>
        )}

        {transcript && (
          <div className="mt-4">
            <div className="text-slate-700 mb-1">Transcript</div>
            <div className="text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded p-3 whitespace-pre-wrap">{transcript}</div>
          </div>
        )}
      </div>
    </div>
  )
}


