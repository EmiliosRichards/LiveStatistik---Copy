export interface AgentStatus {
  agentId: string;
  status: 'im_gespraech' | 'nachbearbeitung' | 'vorbereitung' | 'wartet';
  lastUpdate: Date;
}

export interface DailyStats {
  date: string;
  dayName: string;
  projects: {
    projectId: string;
    projectName: string;
    stats: {
      anzahl: number;
      abgeschlossen: number;
      erfolgreich: number;
      wartezeit: number;
      gespraechszeit: number;
      nachbearbeitungszeit: number;
      vorbereitungszeit: number;
      erfolgProStunde: number;
      arbeitszeit: number;
    };
  }[];
  summary: {
    anzahl: number;
    abgeschlossen: number;
    erfolgreich: number;
    wartezeit: number;
    gespraechszeit: number;
    nachbearbeitungszeit: number;
    vorbereitungszeit: number;
    erfolgProStunde: number;
    arbeitszeit: number;
  };
}

export interface CallOutcomeBreakdown {
  outcome: string;
  category: 'positive' | 'negative';
  count: number;
  percentage: number;
}

export interface DetailedCallInfo {
  id: string;
  contactName?: string;
  contactNumber?: string;
  callStart: Date;
  callEnd?: Date;
  duration?: number;
  outcome: string;
  outcomeCategory: 'positive' | 'negative';
  recordingUrl?: string;
  notes?: string;
}
