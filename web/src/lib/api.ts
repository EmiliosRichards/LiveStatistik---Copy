// Use relative URLs so Next.js rewrites proxy to Express and cookies are sent
const API_BASE = ''

export interface Agent {
  id: string
  name: string
  isActive: boolean
  currentStatus: string
}

export interface Project {
  id: string
  name: string
  isActive: boolean
  status?: 'new' | 'active' | 'archived'
}

export interface Statistics {
  id: string
  agentId: string
  projectId: string
  date: Date
  anzahl: number
  abgeschlossen: number
  erfolgreich: number
  gespraechszeit: number
  wartezeit: number
  nachbearbeitungszeit: number
  vorbereitungszeit: number
  arbeitszeit: number
  erfolgProStunde: number
  outcomes: Record<string, number>
}

export async function fetchProjectsWithCalls(params: {
  agentIds: string[]
  dateFrom?: string
  dateTo?: string
  timeFrom?: string
  timeTo?: string
}): Promise<string[]> {
  const cleaned: Record<string, any> = Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  )
  const res = await fetch(`${API_BASE}/api/projects-with-calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(cleaned)
  })
  if (!res.ok) {
    console.warn('fetchProjectsWithCalls: non-OK response', res.status, res.statusText)
    return []
  }
  return res.json()
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/api/agents`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch agents')
  return res.json()
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`, { credentials: 'include' })
  if (!res.ok) {
    console.warn('fetchProjects: non-OK response', res.status, res.statusText)
    return []
  }
  return res.json()
}

export async function fetchProjectsForAgents(agentIds: string[]): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects-for-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ agentIds })
  })
  if (!res.ok) {
    console.warn('fetchProjectsForAgents: non-OK response', res.status, res.statusText)
    return []
  }
  return res.json()
}

export async function fetchStatistics(params: {
  agentIds: string[]
  projectIds?: string[]
  dateFrom?: string
  dateTo?: string
  timeFrom?: string
  timeTo?: string
}): Promise<Statistics[]> {
  // Remove null/undefined/empty-string fields and empty arrays to satisfy server zod schema
  const cleaned: Record<string, any> = Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  )

  const res = await fetch(`${API_BASE}/api/statistics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(cleaned)
  })
  if (!res.ok) throw new Error('Failed to fetch statistics')
  return res.json()
}
