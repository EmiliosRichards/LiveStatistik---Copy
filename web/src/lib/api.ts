const API_BASE = process.env.NEXT_PUBLIC_EXPRESS_URL || 'http://localhost:5000'

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

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/api/agents`)
  if (!res.ok) throw new Error('Failed to fetch agents')
  return res.json()
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  return res.json()
}

export async function fetchProjectsForAgents(agentIds: string[]): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects-for-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentIds })
  })
  if (!res.ok) throw new Error('Failed to fetch projects')
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
  const res = await fetch(`${API_BASE}/api/statistics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
  if (!res.ok) throw new Error('Failed to fetch statistics')
  return res.json()
}
