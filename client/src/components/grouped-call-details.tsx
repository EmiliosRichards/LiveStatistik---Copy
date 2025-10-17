import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Phone, Clock, User, Building, Plus, Minus, ThumbsDown, ThumbsUp, Paperclip, AudioLines, CheckCircle, XCircle, AlertCircle, X, Filter, ArrowUpDown, MessageCircle, Play, Pause, Download, ChevronUp, SkipBack, SkipForward, Calendar, StickyNote, BarChart3, Check, Headset, FileText } from "lucide-react";
import { type CallDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDuration } from "@/lib/utils";
import { format } from "date-fns";
import { normalizeCalls, groupCalls, formatMMSS, type CallGroup as NormalizedCallGroup } from "@/lib/call-normalization";

interface GroupedCallDetailsProps {
  calls: CallDetails[];
  className?: string;
  expandedGroupIds: Set<string>;
  setExpandedGroupIds: (expanded: Set<string>) => void;
  showDetailColumns?: boolean;
}

// Using the normalized CallGroup from the library
// Legacy interface kept for compatibility with existing code
interface LegacyCallGroup {
  key: string;
  contacts_id: string;
  contacts_campaign_id: string; 
  transactions_fired_date: string;
  calls: any[];
  totalDuration: number;
  firstCallTime: Date;
  latestCall: any; // For header display
  hasSuccessfulCall: boolean;
}

// NotizButton Component for displaying notes
function NotizButton({ 
  notizText,
  callId 
}: { 
  notizText?: string | null;
  callId: string; 
}) {
  const hasNotiz = notizText && notizText.trim().length > 0;

  if (!hasNotiz) {
    return (
      <div className="flex items-center justify-center w-8 h-8">
        <StickyNote className="h-4 w-4 text-red-600 mx-auto" />
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center justify-center w-8 h-8 p-0"
          title="Notiz anzeigen"
        >
          <StickyNote className="h-4 w-4 text-black mx-auto" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-md p-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4 text-black" />
            <span className="text-sm font-medium text-black dark:text-gray-200">Notiz:</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {notizText}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// AudioPlayerTooltip Component for playing recordings
function AudioPlayerTooltip({ recordingUrl, callId }: { recordingUrl: string; callId: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (recordingUrl) {
      const audio = new Audio(recordingUrl);
      audio.preload = 'none'; // Don't preload to save bandwidth
      
      const handleLoadedMetadata = () => setDuration(audio.duration);
      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleEnded = () => setIsPlaying(false);
      
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);
      
      setAudioRef(audio);
      
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
        audio.pause();
      };
    }
  }, [recordingUrl]);

  const togglePlayPause = () => {
    if (!audioRef) return;
    
    if (isPlaying) {
      audioRef.pause();
      setIsPlaying(false);
    } else {
      audioRef.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!recordingUrl) {
    return (
      <div className="flex items-center justify-center w-8 h-8">
        <AudioLines className="h-4 w-4 text-red-600" />
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center justify-center w-8 h-8 p-0"
          title="Audio abspielen"
        >
          <AudioLines className="h-4 w-4 text-green-600" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Aufzeichnung abspielen</h4>
            <span className="text-xs text-gray-500">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              onClick={togglePlayPause}
              className="w-10 h-10"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-100"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>
          
          <div className="text-xs text-gray-500">
            Call-ID: {callId}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// TranscriptionButton Component for transcriptions
function TranscriptionButton({ 
  recordingUrl, 
  callId,
  callTranscriptionStates,
  setCallTranscriptionStates 
}: { 
  recordingUrl: string; 
  callId: string;
  callTranscriptionStates: Record<string, {
    status: 'idle' | 'submitting' | 'pending' | 'completed' | 'failed';
    transcript?: string;
    error?: string;
    audioFileId?: number;
  }>;
  setCallTranscriptionStates: (states: Record<string, any>) => void;
}) {
  const currentState = callTranscriptionStates[callId] || { status: 'idle' };

  const startTranscription = async () => {
    if (!recordingUrl) return;
    
    setCallTranscriptionStates({
      ...callTranscriptionStates,
      [callId]: { status: 'submitting' }
    });
    
    try {
      console.log('🎙️ Starting transcription for call:', callId, recordingUrl);
      
      // Submit transcription job
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: recordingUrl })
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit transcription');
      }
      
      const result = await response.json();
      console.log('✅ Transcription job submitted for call:', callId, result);
      
      setCallTranscriptionStates({
        ...callTranscriptionStates,
        [callId]: { 
          status: 'pending', 
          audioFileId: result.audioFileId 
        }
      });
      
    } catch (error: any) {
      console.error('❌ Transcription error for call:', callId, error);
      setCallTranscriptionStates({
        ...callTranscriptionStates,
        [callId]: { 
          status: 'failed', 
          error: error.message 
        }
      });
    }
  };

  const getButtonIcon = () => {
    switch (currentState.status) {
      case 'submitting':
      case 'pending':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>;
      case 'completed':
        return <MessageCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <MessageCircle className="h-4 w-4 text-red-600" />;
      default:
        return recordingUrl ? <MessageCircle className="h-4 w-4 text-blue-600" /> : <MessageCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  if (currentState.status === 'completed' && currentState.transcript) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center justify-center w-8 h-8 p-0"
            title="Transkription anzeigen"
          >
            {getButtonIcon()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-w-md p-3" onClick={(e) => e.stopPropagation()}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Transkription</span>
            </div>
            <p className="text-sm leading-relaxed max-h-40 overflow-y-auto">
              {currentState.transcript}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex items-center justify-center w-8 h-8 p-0"
      title={
        currentState.status === 'pending' ? 'Transkription läuft...' :
        currentState.status === 'failed' ? 'Transkription fehlgeschlagen' :
        !recordingUrl ? 'Keine Aufzeichnung verfügbar' :
        'Transkription starten'
      }
      onClick={recordingUrl && currentState.status === 'idle' ? startTranscription : undefined}
      disabled={!recordingUrl || currentState.status === 'submitting' || currentState.status === 'pending'}
    >
      {getButtonIcon()}
    </Button>
  );
}

// Helper function to format call time consistently - COPIED FROM WORKING AGENT VIEW
const formatCallTime = (call: any): string => {
  console.log('🕒 GROUPED formatCallTime für Call:', call.id, 'callStart:', call.callStart, 'datum:', call.datum, 'uhrzeit:', call.uhrzeit);
  
  // Try callStart first (ISO format)
  if (call.callStart) {
    try {
      const date = new Date(call.callStart);
      if (!isNaN(date.getTime())) {
        const timeString = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        console.log('🕒 GROUPED Zeit aus callStart:', timeString);
        return timeString;
      }
    } catch (e) {
      console.log('🕒 GROUPED Fehler bei callStart:', e);
    }
  }
  
  // Try German format (datum + uhrzeit)
  if (call.datum && call.uhrzeit) {
    console.log('🕒 GROUPED Versuche German format:', call.datum, call.uhrzeit);
    return call.uhrzeit;
  }
  
  console.log('🕒 GROUPED Keine Zeit gefunden, zeige Strich');
  return '-';
};

export default function GroupedCallDetails({ 
  calls, 
  className = "", 
  expandedGroupIds,
  setExpandedGroupIds,
  showDetailColumns = false 
}: GroupedCallDetailsProps) {
  console.error('🔥🔥🔥 GROUPED CALL DETAILS ACTIVE!!! - calls:', calls?.length, 'showDetailColumns:', showDetailColumns);
  const [callTranscriptionStates, setCallTranscriptionStates] = useState<Record<string, any>>({});

  // SIMPLE SOLUTION: Use original call data directly without calculation
  const groupedCallDetails = useMemo(() => {
    if (!calls?.length) return [];
    
    // Group calls by groupId or contacts data
    const groups = new Map();
    
    calls.forEach((call: any) => {
      const groupKey = call.groupId || 
        `${call.contactsId}|${call.contactsCampaignId}|${call.recordingsDate}`;
      
      if (!groups.has(groupKey)) {
        // Extract time using helper function
        let timeDisplay = formatCallTime(call);
        
        // Format duration: seconds -> "MM:SS"
        let durationDisplay = '-';
        if (call.duration || call.durationInSeconds) {
          const totalSeconds = Math.round(call.duration || call.durationInSeconds || 0);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          durationDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        groups.set(groupKey, {
          key: groupKey,
          calls: [],
          simpleTime: timeDisplay,
          simpleDuration: durationDisplay,
          contacts_id: call.contactsId || '',
          contacts_campaign_id: call.contactsCampaignId || '',
          transactions_fired_date: call.recordingsDate || ''
        });
      }
      
      const group = groups.get(groupKey);
      group.calls.push(call);
      
      // Always update with newest call's data (last one wins)
      group.simpleTime = formatCallTime(call);
      if (call.duration || call.durationInSeconds) {
        const totalSeconds = Math.round(call.duration || call.durationInSeconds || 0);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        group.simpleDuration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    });
    
    return Array.from(groups.values());
  }, [calls]);

  // Toggle function for groups
  const toggleGroupExpansion = (groupKey: string) => {
    const newExpanded = new Set(expandedGroupIds);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroupIds(newExpanded);
  };

  if (calls.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
        Keine Datensätze vorhanden
      </div>
    );
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              { key: 'datum', label: 'Datum', align: 'left' },
              { key: 'uhrzeit', label: 'Zeit', align: 'left' },
              { key: 'wochentag', label: 'Tag', align: 'left' },
              { key: 'outcome', label: 'Outcome', align: 'left' },
              { key: 'durationInSeconds', label: 'Dauer', align: 'center' },
              { key: 'nbz_test', label: 'NBZ (s)', align: 'center', isDetail: true },
              { key: 'vbz_test', label: 'VBZ (s)', align: 'center', isDetail: true },
              { key: 'erfolg_test', label: 'Erfolg', align: 'center', isDetail: true },
              { key: 'az_test', label: 'AZ (s)', align: 'center', isDetail: true },
              // DEBUG COLUMNS for grouping analysis
              { key: 'contacts_id', label: 'Contact ID', align: 'left', isDebug: true },
              { key: 'contacts_campaign_id', label: 'Campaign ID', align: 'left', isDebug: true },
              { key: 'group_id', label: 'Group ID', align: 'left', isDebug: true },
              { key: 'id', label: 'Dialfire Link', align: 'left' },
              { key: 'firmenname', label: 'Firmenname', align: 'left' },
              { key: 'ansprechpartner', label: 'Ansprechpartner', align: 'left' },
              { key: '', label: 'A', align: 'center' },
              { key: '', label: 'T', align: 'center' },
              { key: '', label: 'Notizen', align: 'center' }
            ].filter(column => (!column.isDetail || showDetailColumns) && (!column.isDebug || true)).map((column, idx) => {
              return (
                <TableHead 
                  key={idx}
                  className={`py-2 font-medium text-gray-700 dark:text-gray-300 ${
                    column.label === 'A' || column.label === 'T' || column.label === 'Notizen' ? 'px-1 w-10 text-center justify-center' : 'px-3'
                  } ${
                    column.align === 'center' ? 'text-center' : 'text-left'
                  } ${
                    column.isDetail ? 'bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400' : ''
                  } ${
                    column.isDebug ? 'bg-yellow-100 dark:bg-yellow-900/20 border-l-2 border-r-2 border-yellow-400' : ''
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(() => {
            // Render grouped call details
            return groupedCallDetails.flatMap(group => {
              const isGroupExpanded = expandedGroupIds.has(group.key);
              const groupRows: React.ReactElement[] = [];
              
              // Group header row (blue background)
              groupRows.push(
                <TableRow
                  key={`group-header-${group.key}`}
                  className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer"
                  onClick={() => toggleGroupExpansion(group.key)}
                  data-testid={`group-header-${group.key}`}
                >
                  <TableCell colSpan={showDetailColumns ? 18 : 14} className="px-3 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroupExpansion(group.key);
                          }}
                        >
                          {isGroupExpanded ? (
                            <ChevronDown className="h-4 w-4 text-blue-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-blue-600" />
                          )}
                        </Button>
                        
                        <div className="text-blue-900 dark:text-blue-100 font-medium">
                          <span className="inline-flex items-center">
                            Gruppe: {group.latestCall?.dateKey || 'DEBUG: NO DATE'}
                            <span className="ml-1 text-xs bg-red-100 px-1 rounded">
                              T:{group.latestCall?.callStartTs ? 'YES' : 'NO'} | 
                              D:{group.latestCall?.durationSec || 'NULL'}
                            </span>
                            <span className="ml-2 px-2 py-1 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs rounded-full">
                              ×{group.calls.length}
                            </span>
                            {group.hasSuccessfulCall && (
                              <CheckCircle className="ml-2 h-4 w-4 text-green-600" />
                            )}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-blue-700 dark:text-blue-300">
                        <span className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatMMSS(group.totalDuration || 0)}
                        </span>
                        <span>
                          {(() => {
                            // DEBUG: Log group data to see what's actually in group.calls
                            console.log('🔍 GROUP DEBUG:', {
                              groupKey: group.key,
                              callCount: group.calls.length,
                              firstCall: group.calls[0],
                              hasCallStart: group.calls.some((call: any) => call.callStart)
                            });
                            
                            // Nehme einfach den ersten Call mit callStart
                            const callWithTime = group.calls.find((call: any) => call.callStart);
                            console.log('🔍 FOUND CALL WITH TIME:', callWithTime);
                            
                            if (!callWithTime) {
                              console.log('❌ NO CALL WITH TIME FOUND!');
                              return '-';
                            }
                            
                            const date = new Date(callWithTime.callStart);
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            console.log('✅ FORMATTED TIME:', `${hours}:${minutes}`);
                            return `${hours}:${minutes}`;
                          })()}
                          {group.calls.length > 1 && (
                            <>
                              {' (von '}
                              {group.calls.length}
                              {' Anrufen)'}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
              
              // Individual call rows (only shown when group is expanded)
              if (isGroupExpanded) {
                group.calls.forEach((call, callIdx) => {
                  groupRows.push(
                    <TableRow
                      key={`call-${group.key}-${callIdx}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      data-testid={`call-row-${call.id}`}
                    >
                      <TableCell className="px-3 py-2 text-xs font-mono">{call.datum || '-'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-mono">
                        {formatCallTime(call)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs">{call.wochentag || '-'}</TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex items-center space-x-1">
                          {call.outcomeCategory === 'positive' ? (
                            <ThumbsUp className="h-4 w-4 text-green-600" />
                          ) : call.outcomeCategory === 'negative' ? (
                            <ThumbsDown className="h-4 w-4 text-red-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                          )}
                          <span className="text-xs">{call.outcome || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-center text-xs font-mono">
                        {call.durationInSeconds ? `${Math.floor(call.durationInSeconds / 60)}:${String(call.durationInSeconds % 60).padStart(2, '0')}` : '-'}
                      </TableCell>
                      {showDetailColumns && (
                        <>
                          <TableCell className="px-3 py-2 text-center text-xs font-mono bg-orange-50 dark:bg-orange-900/10">
                            {call.nbz_test || '-'}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-center text-xs font-mono bg-orange-50 dark:bg-orange-900/10">
                            {call.vbz_test || '-'}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-center text-xs font-mono bg-orange-50 dark:bg-orange-900/10">
                            {call.erfolg_test || '-'}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-center text-xs font-mono bg-orange-50 dark:bg-orange-900/10">
                            {call.az_test || '-'}
                          </TableCell>
                        </>
                      )}
                      {/* DEBUG COLUMNS */}
                      <TableCell className="px-3 py-2 text-xs font-mono bg-yellow-50 dark:bg-yellow-900/10 max-w-[100px] truncate">
                        {call.contacts_id || call.contactsId || '-'}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs font-mono bg-yellow-50 dark:bg-yellow-900/10 max-w-[100px] truncate">
                        {call.contacts_campaign_id || call.contactsCampaignId || '-'}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs font-mono bg-yellow-50 dark:bg-yellow-900/10 max-w-[100px] truncate">
                        {call.group_id || call.groupId || '-'}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs">
                        {call.id ? (
                          <a 
                            href={`https://app.dialfire.com/#/calls/${call.id}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {call.id}
                          </a>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs max-w-[150px] truncate" title={call.firmenname}>
                        {call.firmenname || '-'}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs max-w-[150px] truncate" title={call.ansprechpartner}>
                        {call.ansprechpartner || '-'}
                      </TableCell>
                      <TableCell className="px-1 py-2 text-center">
                        <AudioPlayerTooltip recordingUrl={call.recording_url || ''} callId={call.id} />
                      </TableCell>
                      <TableCell className="px-1 py-2 text-center">
                        <TranscriptionButton 
                          recordingUrl={call.recording_url || ''}
                          callId={call.id}
                          callTranscriptionStates={callTranscriptionStates}
                          setCallTranscriptionStates={setCallTranscriptionStates}
                        />
                      </TableCell>
                      <TableCell className="px-1 py-2 text-center">
                        <NotizButton notizText={call.notiz} callId={call.id} />
                      </TableCell>
                    </TableRow>
                  );
                });
              }
              
              return groupRows;
            });
          })()}
        </TableBody>
      </Table>
    </div>
  );
}