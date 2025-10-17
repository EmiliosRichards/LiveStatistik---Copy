import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from '@tanstack/react-query';
import { type CallDetails } from "@shared/schema";

interface SimpleCallDetailsProps {
  agentId: string;
  projectId: string;
  dateFrom?: string;
  dateTo?: string;
  outcomeName: string;
}

// Helper function to format call time consistently
const formatCallTime = (call: any, locale: string = 'de-DE'): string => {
  console.log('🕒 Simple formatCallTime für Call:', call.id, 'callStart:', call.callStart, 'datum:', call.datum, 'uhrzeit:', call.uhrzeit);
  
  // Try callStart first (ISO format)
  if (call.callStart) {
    try {
      const date = new Date(call.callStart);
      if (!isNaN(date.getTime())) {
        const timeString = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        console.log('🕒 Simple Zeit aus callStart:', timeString);
        return timeString;
      }
    } catch (e) {
      console.log('🕒 Simple Fehler bei callStart:', e);
    }
  }
  
  // Try German format (datum + uhrzeit)
  if (call.datum && call.uhrzeit) {
    console.log('🕒 Simple Versuche German format:', call.datum, call.uhrzeit);
    return call.uhrzeit;
  }
  
  console.log('🕒 Simple Keine Zeit gefunden, zeige Strich');
  return '-';
};

export default function SimpleCallDetails({ agentId, projectId, dateFrom, dateTo, outcomeName }: SimpleCallDetailsProps) {
  const { t } = useTranslation();
  console.error('🔥🔥🔥 SIMPLE CALL DETAILS COMPONENT ACTIVE!!! - outcomeName:', outcomeName);
  console.error('🔥🔥🔥 SIMPLE CALL DETAILS COMPONENT ACTIVE!!! - agentId:', agentId, 'projectId:', projectId);
  
  // Load call details for this outcome
  const { data: callDetails, isLoading, error } = useQuery({
    queryKey: ['/api/call-details', agentId, projectId, outcomeName, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      if (outcomeName) params.append('outcome', outcomeName);
      
      const response = await fetch(`/api/call-details/${agentId}/${projectId}?${params}`);
      if (!response.ok) {
        throw new Error('Failed to load call details');
      }
      return response.json();
    }
  });

  console.log('🎯 Simple Call details loaded:', callDetails?.length || 0, 'calls');

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground animate-pulse">
          {t('emptyStates.loadingCallDetails')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-red-500">
{t('errors.loadingFailed')}
        </div>
      </div>
    );
  }

  // Filter calls by outcome
  const filteredCalls = callDetails?.filter((call: any) => 
    call.callOutcome === outcomeName || call.outcome === outcomeName
  ) || [];

  console.log('🎯 Simple Filtered calls for outcome', outcomeName, ':', filteredCalls.length);

  if (filteredCalls.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
{t('emptyStates.noCallsForAgents')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground mb-2">
📞 {filteredCalls.length} {filteredCalls.length === 1 ? t('common.call') : t('common.calls')} {t('common.for')} "{outcomeName}":
      </div>
      
      {/* Mini table */}
      <div className="text-xs">
        <div className="grid grid-cols-3 gap-2 font-medium text-muted-foreground mb-1 border-b pb-1">
          <div>{t('callDetails.date', 'Datum')}</div>
          <div>{t('callDetails.time', 'Zeit')}</div>
          <div>{t('callDetails.duration', 'Dauer')}</div>
        </div>
        
        {filteredCalls.slice(0, 5).map((call: any) => (
          <div key={call.id} className="grid grid-cols-3 gap-2 py-0.5 border-b border-gray-100 dark:border-gray-800">
            <div className="font-mono text-xs">
              {call.datum || call.recordingsDate || '-'}
            </div>
            <div className="font-mono text-xs">
              {formatCallTime(call, t('common.locale'))}
            </div>
            <div className="font-mono text-xs">
              {call.duration ? 
                `${Math.floor(call.duration / 60).toString().padStart(2, '0')}:${(call.duration % 60).toString().padStart(2, '0')}` 
                : '-'
              }
            </div>
          </div>
        ))}
        
        {filteredCalls.length > 5 && (
          <div className="text-xs text-muted-foreground mt-1 italic">
... {t('common.and')} {filteredCalls.length - 5} {t('common.more')}
          </div>
        )}
      </div>
    </div>
  );
}