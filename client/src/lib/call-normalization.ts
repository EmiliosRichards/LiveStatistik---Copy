import { parseISO, format } from 'date-fns';

export interface NormalizedCall {
  id: string;
  contactsId: string;
  campaignId: string;
  callStartTs: number | null; // epoch ms
  durationSec: number;
  outcomeCategory: 'positive' | 'neutral' | 'negative';
  dateKey: string; // yyyy-MM-dd
  groupKey: string;
  hasValidTime: boolean;
  // Keep original fields for detail display
  original: any;
}

export interface CallGroup {
  key: string;
  latestCall: NormalizedCall;
  firstCallTs: number | null;
  calls: NormalizedCall[];
  hasSuccessfulCall: boolean;
  totalDuration: number; // Only for detail columns, never header
}

/**
 * Safely parse various date formats from Dialfire
 */
export function safeParseDate(raw: any): number | null {
  if (!raw) return null;
  
  try {
    // Handle string inputs
    if (typeof raw === 'string') {
      let sanitized = raw.trim();
      
      // Fix common Dialfire format issues
      // "2025-09-04T11-59-41-424Z" -> "2025-09-04T11:59:41.424Z"
      sanitized = sanitized.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
      
      // Try ISO parsing first
      const isoDate = parseISO(sanitized);
      if (!isNaN(isoDate.getTime())) {
        return isoDate.getTime();
      }
      
      // Try native Date parsing for "YYYY-MM-DD HH:mm:ss" format
      const nativeDate = new Date(sanitized);
      if (!isNaN(nativeDate.getTime())) {
        return nativeDate.getTime();
      }
    }
    
    // Handle Date objects
    if (raw instanceof Date) {
      return isNaN(raw.getTime()) ? null : raw.getTime();
    }
    
    // Handle numbers (already epoch)
    if (typeof raw === 'number') {
      return raw;
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Combine recordingsDate + uhrzeit if callStart is missing
 */
function combineDateTime(recordingsDate: string, uhrzeit: string): string | null {
  if (!recordingsDate || !uhrzeit || uhrzeit === '-' || uhrzeit === '') {
    return null;
  }
  
  // "2025-09-15" + "16:23" -> "2025-09-15 16:23"
  return `${recordingsDate} ${uhrzeit}`;
}

/**
 * Normalize outcome to standard categories
 */
function normalizeOutcome(outcome: string): 'positive' | 'neutral' | 'negative' {
  if (!outcome) return 'neutral';
  
  const lower = outcome.toLowerCase();
  
  // Positive outcomes
  if (lower.includes('termin') || lower.includes('success') || lower.includes('gebucht')) {
    return 'positive';
  }
  
  // Negative outcomes  
  if (lower.includes('declined') || lower.includes('gatekeeper') || lower.includes('ansprechpartner') || 
      lower.includes('existiert_nicht') || lower.includes('zielgruppe')) {
    return 'negative';
  }
  
  // Default to neutral for $none, $follow_up_*, etc.
  return 'neutral';
}

/**
 * Normalize raw call data into standard format
 */
export function normalizeCalls(rawCalls: any[]): NormalizedCall[] {
  return rawCalls.map((call, index) => {
    // Try multiple timestamp sources
    let callStartTs = safeParseDate(call.callStart);
    
    if (!callStartTs && call.recordingsDate && call.uhrzeit) {
      const combined = combineDateTime(call.recordingsDate, call.uhrzeit);
      callStartTs = safeParseDate(combined);
    }
    
    if (!callStartTs && call.recordingsDate) {
      callStartTs = safeParseDate(call.recordingsDate);
    }
    
    // Extract duration in seconds
    const durationSec = Math.round(call.durationInSeconds || call.duration || 0);
    
    // Create date key for grouping
    let dateKey = '';
    if (callStartTs) {
      dateKey = format(new Date(callStartTs), 'yyyy-MM-dd');
    } else if (call.recordingsDate) {
      dateKey = call.recordingsDate.split('T')[0]; // Take date part only
    }
    
    // Create group key - prefer explicit group_id
    const groupKey = call.groupId || call.group_id || 
                    `${call.contactsId || call.contacts_id}|${call.contactsCampaignId || call.contacts_campaign_id}|${dateKey}`;
    
    return {
      id: call.id,
      contactsId: call.contactsId || call.contacts_id || '',
      campaignId: call.contactsCampaignId || call.contacts_campaign_id || '',
      callStartTs,
      durationSec,
      outcomeCategory: normalizeOutcome(call.outcome),
      dateKey,
      groupKey,
      hasValidTime: callStartTs !== null,
      original: call
    };
  });
}

/**
 * Group normalized calls and determine latest call per group
 */
export function groupCalls(normalizedCalls: NormalizedCall[]): CallGroup[] {
  const groups = new Map<string, CallGroup>();
  
  normalizedCalls.forEach((call, index) => {
    if (!groups.has(call.groupKey)) {
      groups.set(call.groupKey, {
        key: call.groupKey,
        latestCall: call,
        firstCallTs: call.callStartTs,
        calls: [],
        hasSuccessfulCall: false,
        totalDuration: 0
      });
    }
    
    const group = groups.get(call.groupKey)!;
    group.calls.push(call);
    group.totalDuration += call.durationSec;
    
    if (call.outcomeCategory === 'positive') {
      group.hasSuccessfulCall = true;
    }
    
    // Update first call timestamp
    if (call.callStartTs && (!group.firstCallTs || call.callStartTs < group.firstCallTs)) {
      group.firstCallTs = call.callStartTs;
    }
    
    // Deterministic latest call selection
    const currentLatest = group.latestCall;
    
    // Prefer calls with valid timestamps
    if (!currentLatest.hasValidTime && call.hasValidTime) {
      group.latestCall = call;
    } else if (currentLatest.hasValidTime && call.hasValidTime) {
      // Both have valid timestamps - pick the newer one
      if (call.callStartTs! > currentLatest.callStartTs!) {
        group.latestCall = call;
      }
    } else if (!currentLatest.hasValidTime && !call.hasValidTime) {
      // Neither has valid timestamp - use source order (later index wins)
      group.latestCall = call;
    }
    // If current latest has valid time but new call doesn't, keep current latest
  });
  
  // Sort groups by latest call timestamp (newest first)
  return Array.from(groups.values()).sort((a, b) => {
    const aTime = a.latestCall.callStartTs || 0;
    const bTime = b.latestCall.callStartTs || 0;
    return bTime - aTime; // Descending
  });
}

/**
 * Format timestamp as HH:mm
 */
export function formatHHmm(timestamp: number | null): string {
  if (!timestamp) return '--:--';
  
  try {
    return format(new Date(timestamp), 'HH:mm');
  } catch (e) {
    return '--:--';
  }
}

/**
 * Format duration as MM:SS
 */
export function formatMMSS(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}