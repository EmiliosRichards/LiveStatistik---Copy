// Last update: 2025-09-17 11:23:00 - Fixed infinite console loop
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
// REMOVED: import { useCampaignCategories, useCampaignCategoriesMap } from "@/hooks/use-campaign-categories";
import { format } from "date-fns";
import { type Agent, type Project, type AgentStatistics, type CallOutcome, type CallDetails } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CallNotification } from "@/components/call-notification";
import { Plus, Minus, ThumbsDown, ThumbsUp, Paperclip, AudioLines, CheckCircle, XCircle, AlertCircle, X, Filter, ChevronDown, ArrowUpDown, MessageCircle, Play, Pause, Download, ChevronUp, SkipBack, SkipForward, Calendar, StickyNote, BarChart3, Check, Headset, Clock, FileText, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import GroupedCallDetails from "@/components/grouped-call-details";

// Helper function to format call time consistently
const formatCallTime = (call: any, locale: string = 'de-DE'): string => {
  console.log('🕒 Stats formatCallTime für Call:', call.id, 'callStart:', call.callStart, 'datum:', call.datum, 'uhrzeit:', call.uhrzeit);
  
  // Try callStart first (ISO format)
  if (call.callStart) {
    try {
      const date = new Date(call.callStart);
      if (!isNaN(date.getTime())) {
        const timeString = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        console.log('🕒 Stats Zeit aus callStart:', timeString);
        return timeString;
      }
    } catch (e) {
      console.log('🕒 Stats Fehler bei callStart:', e);
    }
  }
  
  // Try German format (datum + uhrzeit)
  if (call.datum && call.uhrzeit) {
    console.log('🕒 Stats Versuche German format:', call.datum, call.uhrzeit);
    return call.uhrzeit;
  }
  
  console.log('🕒 Stats Keine Zeit gefunden, zeige Strich');
  return '-';
};

// NotizButton Component for displaying notes
function NotizButton({ 
  notizText,
  callId 
}: { 
  notizText?: string | null;
  callId: string; 
}) {
  const { t } = useTranslation();
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
          title={t('callDetails.showNote')}
        >
          <StickyNote className="h-4 w-4 text-black mx-auto" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-md p-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4 text-black" />
            <span className="text-sm font-medium text-black dark:text-gray-200">{t('callDetails.note')}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {notizText}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// TranscriptionButton Component for individual call details
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
  setCallTranscriptionStates: React.Dispatch<React.SetStateAction<Record<string, {
    status: 'idle' | 'submitting' | 'pending' | 'completed' | 'failed';
    transcript?: string;
    error?: string;
    audioFileId?: number;
  }>>>;
}) {
  const currentState = callTranscriptionStates[callId] || { status: 'idle' };

  // Transcription functions  
  const startTranscription = async () => {
    if (!recordingUrl) return;
    
    setCallTranscriptionStates((prev) => ({
      ...prev,
      [callId]: { status: 'submitting' }
    }));
    
    try {
      console.log('🎙️ Starting transcription for call:', callId, 'URL:', recordingUrl);
      
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
      
      setCallTranscriptionStates((prev) => ({
        ...prev,
        [callId]: { 
          status: 'pending', 
          audioFileId: result.audioFileId 
        }
      }));
      
      // Start polling for completion
      pollTranscriptionStatus(result.audioFileId);
      
    } catch (error: any) {
      console.error('❌ Transcription error for call:', callId, error);
      setCallTranscriptionStates((prev) => ({
        ...prev,
        [callId]: { 
          status: 'failed', 
          error: error.message 
        }
      }));
    }
  };
  
  const pollTranscriptionStatus = async (audioFileId: number) => {
    const maxAttempts = 12; // 2 minutes
    let attempts = 0;
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/transcribe/${audioFileId}/status`);
        const result = await response.json();
        
        console.log('📊 Transcription status for call:', callId, result);
        
        if (result.status === 'completed' && result.transcript) {
          setCallTranscriptionStates((prev) => ({
            ...prev,
            [callId]: {
              status: 'completed',
              transcript: result.transcript,
              audioFileId
            }
          }));
          return;
        }
        
        if (result.status === 'failed') {
          setCallTranscriptionStates((prev) => ({
            ...prev,
            [callId]: {
              status: 'failed',
              error: 'Transcription failed',
              audioFileId
            }
          }));
          return;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Wait 10 seconds
        } else {
          setCallTranscriptionStates((prev) => ({
            ...prev,
            [callId]: {
              status: 'failed',
              error: 'Transcription timeout',
              audioFileId
            }
          }));
        }
        
      } catch (error: any) {
        console.error('❌ Polling error for call:', callId, error);
        setCallTranscriptionStates((prev) => ({
          ...prev,
          [callId]: {
            status: 'failed',
            error: error.message,
            audioFileId
          }
        }));
      }
    };
    
    poll();
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If transcription is completed, do nothing here - let the popover handle display
    if (currentState.status === 'completed') {
      return;
    }
    
    // Otherwise start transcription
    startTranscription();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleButtonClick}
          className="flex items-center justify-center w-8 h-8 p-0"
          title={currentState.status === 'completed' ? 'Transkript anzeigen' : 'Transkription erstellen'}
          disabled={currentState.status === 'submitting' || currentState.status === 'pending'}
        >
          {currentState.status === 'submitting' || currentState.status === 'pending' ? (
            <div className="h-3 w-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"/>
          ) : currentState.status === 'completed' ? (
            <MessageCircle className="h-3 w-3 text-blue-600 border border-blue-600 rounded-full" />
          ) : currentState.status === 'failed' ? (
            <MessageCircle className="h-3 w-3 text-red-600" />
          ) : (
            <MessageCircle className="h-3 w-3 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-md p-3" onClick={(e) => e.stopPropagation()}>
        {currentState.status === 'completed' && currentState.transcript ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Transkript:</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {currentState.transcript}
            </p>
          </div>
        ) : currentState.status === 'failed' && currentState.error ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">Transkription fehlgeschlagen:</span>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              {currentState.error}
            </p>
          </div>
        ) : currentState.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"/>
            <span className="text-sm text-gray-600 dark:text-gray-400">Transkription läuft...</span>
          </div>
        ) : (
          <p className="text-sm text-left">
            Klicken Sie hier, um die Transkription dieser Aufzeichnung zu erstellen.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// AudioPlayer Component for tooltips
function AudioPlayerTooltip({ recordingUrl, callDuration }: { recordingUrl?: string; callDuration?: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (recordingUrl) {
      console.log('🎵 Loading audio from:', recordingUrl);
      
      // Create audio element first
      const audioElement = new Audio();
      setAudio(audioElement);

      // Set audio source
      audioElement.src = recordingUrl;
      audioElement.preload = 'metadata';
      audioElement.playbackRate = playbackRate;

      // Immediately use call duration if available, show loading if not
      if (callDuration && callDuration > 0) {
        console.log(`🎵 Using call duration immediately: ${callDuration}s (${Math.floor(callDuration/60)}:${(callDuration%60).toString().padStart(2,'0')})`);
        setDuration(callDuration);
        setIsLoading(false);
        // Skip waiting for metadata but still setup event listeners
      } else {
        console.log(`⏳ No call duration available (received: ${callDuration}), trying audio metadata...`);
        setIsLoading(true);
        setDuration(0); // Start with 0, will be updated by audio or timeout
      }

      // Only set timeout if no call duration is available
      if (!callDuration || callDuration <= 0) {
        const timeoutId = setTimeout(() => {
          if (isLoading) {
            console.log(`⏰ Loading timeout - no call duration, using minimal fallback`);
            setDuration(60); // 60 seconds fallback when no call duration available
            setIsLoading(false);
          }
        }, 3000);
        setLoadingTimeout(timeoutId);
      }

      const handleLoadedMetadata = () => {
        console.log('✅ Audio metadata loaded! Duration:', audioElement.duration);
        if (isFinite(audioElement.duration) && audioElement.duration > 0) {
          console.log('🎵 Audio metadata duration found:', audioElement.duration);
          // Only use audio duration if it's significantly different from call duration
          if (!callDuration || Math.abs(audioElement.duration - callDuration) > 5) {
            console.log('🔄 Using audio metadata duration (significant difference)');
            setDuration(audioElement.duration);
          } else {
            console.log('✅ Keeping call duration (audio metadata similar)');
          }
          setIsLoading(false);
          // Clear timeout since we got real duration
          if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            setLoadingTimeout(null);
          }
        } else if (audioElement.duration === Infinity) {
          console.log('📻 Audio has infinite duration (likely streaming)');
          if (!callDuration || callDuration <= 0) {
            setDuration(60); // 1 minute for streaming without call duration
            setIsLoading(false);
          }
        } else {
          console.warn('⚠️ Invalid duration, keeping current state');
        }
      };
      
      const handleProgress = () => {
        if (audioElement.buffered.length > 0) {
          const bufferedEnd = audioElement.buffered.end(audioElement.buffered.length - 1);
          const progress = (bufferedEnd / audioElement.duration) * 100;
          setLoadProgress(Math.min(progress, 100));
        }
      };
      
      const handleLoadStart = () => {
        // Only set loading if we don't have call duration
        if (!callDuration || callDuration <= 0) {
          setIsLoading(true);
        }
        setLoadProgress(0);
      };
      
      const handleCanPlay = () => {
        console.log('✅ Audio can play! Duration:', audioElement.duration);
        
        // Only try to get duration if we don't have call duration
        if (!callDuration || callDuration <= 0) {
          if (isFinite(audioElement.duration) && audioElement.duration > 0) {
            console.log('🎵 Duration available at canplay:', audioElement.duration);
            setDuration(audioElement.duration);
            setIsLoading(false);
            // Clear timeout since we got real duration
            if (loadingTimeout) {
              clearTimeout(loadingTimeout);
              setLoadingTimeout(null);
            }
          } else if (audioElement.duration === Infinity) {
            console.log('📻 Streaming audio detected');
            setDuration(60); // Start with 1 minute for streaming, will grow as needed
            setIsLoading(false);
            // Clear timeout for streaming
            if (loadingTimeout) {
              clearTimeout(loadingTimeout);
              setLoadingTimeout(null);
            }
          }
        } else {
          console.log('✅ Already have call duration, not overriding');
        }
        
        // Log seekable ranges for debugging
        console.log('🎛️ Seekable ranges:', audioElement.seekable.length);
        for (let i = 0; i < audioElement.seekable.length; i++) {
          console.log(`  Range ${i}: ${audioElement.seekable.start(i)} - ${audioElement.seekable.end(i)}`);
        }
      };
      
      const handleTimeUpdate = () => {
        if (isFinite(audioElement.currentTime) && !isSeeking) {
          setCurrentTime(audioElement.currentTime);
          
          // Only modify duration if we don't have a call duration (fallback scenarios)
          if (!callDuration || callDuration <= 0) {
            // Update duration if we discover it's longer than expected
            if (isFinite(audioElement.duration) && audioElement.duration > duration) {
              console.log(`🔄 Updating duration from ${duration}s to ${audioElement.duration}s`);
              setDuration(audioElement.duration);
            }
            
            // For streaming audio (infinity duration), grow duration as needed
            if (audioElement.duration === Infinity && audioElement.currentTime > duration - 10) {
              setDuration(duration + 30); // Extend by 30s when getting close to the end
            }
            
            // For files where we used a fallback, extend if we reach the limit
            if (audioElement.duration !== Infinity && audioElement.currentTime > duration - 5) {
              console.log(`🔄 Audio seems longer than expected (${duration}s), extending duration`);
              setDuration(duration + 30);
            }
          }
        }
      };
      
      const handleDurationChange = () => {
        if (isFinite(audioElement.duration) && audioElement.duration > 0) {
          console.log(`🔄 Duration changed to: ${audioElement.duration}s`);
          setDuration(audioElement.duration);
          if (isLoading) {
            setIsLoading(false);
          }
          // Clear timeout since we got real duration
          if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            setLoadingTimeout(null);
          }
        }
      };

      const handleEnded = () => setIsPlaying(false);
      const handleError = (e: Event) => {
        console.error('❌ Audio loading error:', e);
        console.error('❌ Audio error details:', audioElement.error);
        setDuration(-1); // Set to -1 to show error state
      };

      audioElement.addEventListener('loadstart', handleLoadStart);
      audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      audioElement.addEventListener('canplay', handleCanPlay);
      audioElement.addEventListener('progress', handleProgress);
      audioElement.addEventListener('timeupdate', handleTimeUpdate);
      audioElement.addEventListener('durationchange', handleDurationChange);
      audioElement.addEventListener('ended', handleEnded);
      audioElement.addEventListener('error', handleError);
      
      // Set source after event listeners are attached
      audioElement.src = recordingUrl;
      audioElement.load(); // Force load

      return () => {
        // Clear timeout on cleanup
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }
        audioElement.removeEventListener('loadstart', handleLoadStart);
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.removeEventListener('canplay', handleCanPlay);
        audioElement.removeEventListener('progress', handleProgress);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        audioElement.removeEventListener('durationchange', handleDurationChange);
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('error', handleError);
        audioElement.pause();
        audioElement.src = '';
      };
    }
  }, [recordingUrl]);

  const togglePlayPause = async () => {
    if (audio && duration > 0) {
      try {
        if (isPlaying) {
          audio.pause();
          setIsPlaying(false);
        } else {
          await audio.play();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error('Audio playback error:', error);
        setIsPlaying(false);
      }
    }
  };

  const skipBackward = () => {
    if (audio && duration > 0) {
      const newTime = Math.max(currentTime - 5, 0); // 5 seconds back
      try {
        // Set seeking flag to prevent timeupdate from overriding
        setIsSeeking(true);
        // Set UI state immediately
        setCurrentTime(newTime);
        // Update audio position
        audio.currentTime = newTime;
        console.log(`⏪ Skipped backward to: ${newTime}s`);
        
        // Clear seeking flag after a short delay to allow audio to catch up
        setTimeout(() => setIsSeeking(false), 100);
      } catch (error) {
        console.error('❌ Could not skip backward:', error);
        setIsSeeking(false);
        // Reset to original position if seek fails
        setCurrentTime(currentTime);
      }
    }
  };

  const skipForward = () => {
    if (audio && duration > 0) {
      const newTime = Math.min(currentTime + 5, duration - 1); // 5 seconds forward
      try {
        // Set seeking flag to prevent timeupdate from overriding
        setIsSeeking(true);
        // Set UI state immediately
        setCurrentTime(newTime);
        // Update audio position
        audio.currentTime = newTime;
        console.log(`⏩ Skipped forward to: ${newTime}s`);
        
        // Clear seeking flag after a short delay to allow audio to catch up
        setTimeout(() => setIsSeeking(false), 100);
      } catch (error) {
        console.error('❌ Could not skip forward:', error);
        setIsSeeking(false);
        // Reset to original position if seek fails
        setCurrentTime(currentTime);
      }
    }
  };

  const downloadAudio = () => {
    if (recordingUrl) {
      window.open(recordingUrl, '_blank');
    }
  };

  const seekToProgress = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audio && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = Math.max(0, Math.min(percentage * duration, duration - 1));
      
      try {
        setIsSeeking(true);
        setCurrentTime(newTime);
        audio.currentTime = newTime;
        console.log(`🎯 Seeked to: ${newTime}s (${Math.round(percentage * 100)}%)`);
        
        setTimeout(() => setIsSeeking(false), 100);
      } catch (error) {
        console.error('❌ Could not seek:', error);
        setIsSeeking(false);
      }
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (audio) {
      audio.playbackRate = rate;
      setPlaybackRate(rate);
      console.log(`🎵 Playback rate changed to: ${rate}x`);
    }
  };


  const formatTime = (time: number) => {
    if (!isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!recordingUrl) return <div>Keine Aufzeichnung verfügbar</div>;

  if (duration === -1) {
    return <div className="text-red-500 text-sm">Audio-Fehler</div>;
  }

  // Show loading until we have a valid duration
  if (isLoading || duration === 0) {
    return (
      <div className="flex items-center space-x-2 py-2">
        <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"/>
        <span className="text-sm text-gray-500">Lade Audio-Informationen...</span>
      </div>
    );
  }

  return (
    <>
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 space-y-2 border border-gray-200 dark:border-gray-700 min-w-0">
      {/* Loading Bar - only show when loading */}
      {isLoading && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
          <div 
            className="bg-blue-600 h-1 rounded-full transition-all duration-300"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}
      
      {/* VLC-Style Layout: Progress Bar oben, Controls unten */}
      <div className="space-y-2">
        {/* Time Display */}
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        
        {/* Progress Bar - Prominent oben wie bei VLC */}
        <div 
          className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-3 cursor-pointer"
          onClick={seekToProgress}
          title="Klicken zum Springen"
        >
          <div 
            className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-150"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        
        {/* Controls unten - wie bei VLC */}
        <div className="flex items-center justify-center space-x-1">
          {/* Play Controls */}
          <Button
            variant="ghost" 
            size="sm"
            onClick={skipBackward}
            className="flex items-center justify-center w-6 h-6 p-0 flex-shrink-0"
            disabled={duration <= 0}
            title="5s zurück"
          >
            <SkipBack className="h-3 w-3" />
          </Button>
          
          <Button
            variant={isPlaying ? "default" : "ghost"}
            size="sm"
            onClick={togglePlayPause}
            className="flex items-center justify-center w-7 h-7 p-0 flex-shrink-0"
            disabled={duration <= 0}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <div className="h-3 w-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"/>
            ) : isPlaying ? (
              <Pause className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
          </Button>
          
          <Button
            variant="ghost" 
            size="sm"
            onClick={skipForward}
            className="flex items-center justify-center w-6 h-6 p-0 flex-shrink-0"
            disabled={duration <= 0}
            title="5s vor"
          >
            <SkipForward className="h-3 w-3" />
          </Button>
          
          {/* Speed Controls */}
          {[1, 1.5, 2].map((rate) => (
            <Button
              key={rate}
              variant={playbackRate === rate ? "default" : "ghost"}
              size="sm"
              onClick={() => changePlaybackRate(rate)}
              className="flex items-center justify-center w-7 h-6 p-0 text-xs font-medium flex-shrink-0"
              disabled={duration <= 0}
              title={`${rate}x Speed`}
            >
              {rate}x
            </Button>
          ))}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadAudio}
            className="flex items-center justify-center w-6 h-6 p-0 flex-shrink-0"
            title="Download"
            disabled={false}
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}

interface AgentStatisticsTableProps {
  agents: Agent[];
  projects: Project[];
  statistics: AgentStatistics[];
  statisticsLoading?: boolean;
  filters: any;
  onFilterChange?: (filters: any) => void;
  sortBy?: 'name-asc' | 'name-desc' | 'positive-desc' | 'negative-desc';
  onSortChange?: (sortBy: 'name-asc' | 'name-desc' | 'positive-desc' | 'negative-desc') => void;
  expandedAgents: Set<string>;
  setExpandedAgents: (expanded: Set<string>) => void;
  expandedOutcomes: Set<string>;
  setExpandedOutcomes: (expanded: Set<string>) => void;
  expandedCallDetails: Set<string>;
  setExpandedCallDetails: (details: Set<string>) => void;
  expandedGroupIds: Set<string>;
  setExpandedGroupIds: (groups: Set<string>) => void;
  expandedProjectCallDetails: Set<string>;
  setExpandedProjectCallDetails: (details: Set<string>) => void;
  expandedProjects: Set<string>;
  setExpandedProjects: (projects: Set<string>) => void;
  expandedIndividualProjects: Set<string>;
  setExpandedIndividualProjects: (projects: Set<string>) => void;
  showDetailColumns: boolean;
  setShowDetailColumns: (show: boolean) => void;
  callDetailsRefreshKey?: number;
  hasSearched?: boolean;
}

export default function AgentStatisticsTable({ 
  agents, 
  projects, 
  statistics, 
  statisticsLoading = false,
  filters,
  onFilterChange,
  sortBy = 'name-asc',
  onSortChange,
  expandedAgents,
  setExpandedAgents,
  expandedOutcomes,
  setExpandedOutcomes,
  expandedCallDetails,
  setExpandedCallDetails,
  expandedGroupIds,
  setExpandedGroupIds,
  expandedProjectCallDetails,
  setExpandedProjectCallDetails,
  expandedProjects,
  setExpandedProjects,
  expandedIndividualProjects,
  setExpandedIndividualProjects,
  showDetailColumns,
  setShowDetailColumns,
  callDetailsRefreshKey = 0,
  hasSearched = false
}: AgentStatisticsTableProps) {
  const { t } = useTranslation();
  const [callOutcomes, setCallOutcomes] = useState<CallOutcome[]>([]);
  
  // Extract real campaign IDs from projects
  const campaignIds = useMemo(() => {
    return Array.from(new Set(
      projects.map(p => {
        // Try campaignId field first, then id if it matches campaign pattern
        const campaignId = (p as any).campaignId || 
          (typeof p.id === 'string' && /^[A-Z0-9]{16}$/.test(p.id) ? p.id : undefined) ||
          (typeof p.name === 'string' && /^[A-Z0-9]{16}$/.test(p.name) ? p.name : undefined);
        return campaignId;
      }).filter(Boolean) as string[]
    )).slice(0, 10);
  }, [projects]);
  
  // REMOVED: console.log('🎯 Using original campaign IDs for categories:', campaignIds);
  
  // Normalization helper for consistent matching
  const normalizeOutcome = (outcome: string): string => {
    return outcome?.toString().trim().toLowerCase().replaceAll(" ", "_");
  };

  // Helper function to classify outcomes using dynamic categories
  const classifyOutcome = (outcomeName: string, campaignId?: string): 'positive' | 'negative' | 'offen' => {
    if (categoriesLoading || categoriesMap.size === 0) {
      return 'offen';
    }
    
    const normalized = normalizeOutcome(outcomeName);
    
    // Check all categories from the map
    // If specific campaign provided, check that campaign or fallback to 'all'
    const categories = categoriesMap.get(campaignId || '') || categoriesMap.get('all');
    if (categories) {
      if (categories?.success?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
        return 'positive';
      } else if (categories?.declined?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
        return 'negative'; 
      } else if (categories?.open?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
        return 'offen';
      }
    }

    // Fallback: check all campaigns
    for (const [cId, categories] of Array.from(categoriesMap.entries())) {
      if (categories.success?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
        return 'positive';
      }
      
      if (categories.declined?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
        return 'negative';
      }
      
      if (categories.open?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
        return 'offen';
      }
    }
    
    return 'offen';
  };

  // Helper function to create CallOutcome objects ONLY for outcomes that actually exist in current data
  const createDynamicCallOutcomes = (categoriesMap: Map<string, any>, actualOutcomes: Record<string, number>, projectIds: string[] = []) => {
    const outcomes: CallOutcome[] = [];
    
    if (categoriesMap.size === 0) {
      return outcomes;
    }
    
    // Only create outcomes for entries that actually exist in the data
    let displayOrder = 1;
    Object.keys(actualOutcomes).forEach(outcomeName => {
      // Try to classify using project-specific categories first
      let classification: 'positive' | 'negative' | 'offen' = 'offen';
      
      if (projectIds.length === 1) {
        // Single project view - use project-specific categories
        classification = classifyOutcome(outcomeName, projectIds[0]);
      } else {
        // Multi-project or agent view - check all projects
        for (const projectId of projectIds) {
          const result = classifyOutcome(outcomeName, projectId);
          if (result !== 'offen') {
            classification = result;
            break;
          }
        }
        // Fallback to 'all' if not found in any project
        if (classification === 'offen') {
          classification = classifyOutcome(outcomeName, 'all');
        }
      }
      
      outcomes.push({
        id: outcomeName,
        name: outcomeName,
        category: classification,
        displayOrder: displayOrder++
      });
    });
    
    return outcomes;
  };
  const [durationFilters, setDurationFilters] = useState<Record<string, string[]>>({});
  const [timeFilters, setTimeFilters] = useState<Record<string, { timeFrom?: string; timeTo?: string }>>({});
  const [callDetailsCache, setCallDetailsCache] = useState<Record<string, { 
    data: any[], 
    loading: boolean, 
    updating: boolean, 
    lastIds: string[],
    metadata?: {
      agentId: string,
      outcomeName: string,
      timeFrom?: string,
      timeTo?: string
    }
  }>>({});
  const [notifications, setNotifications] = useState<Record<string, { message: string; category: string; count: number; visible: boolean; agentName?: string; status: 'positive' | 'negative' | 'open' }>>({});
  
  // Effect to clear cache when callDetailsRefreshKey changes (from parent)
  useEffect(() => {
    if (callDetailsRefreshKey > 0) {
      // Instead of clearing, mark all entries for background update
      setCallDetailsCache(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          // Keep the existing data but mark for update
          if (updated[key].data.length > 0) {
            updated[key] = { ...updated[key], updating: true };
          }
        });
        
        // Trigger background updates for all cached entries using the current state
        setTimeout(() => {
          Object.keys(updated).forEach(cacheKey => {
            const cached = updated[cacheKey];
            if (cached && cached.data.length > 0 && !cached.loading) {
              // Extract the expandedCallDetail from cacheKey
              const parts = cacheKey.split('-');
              const timeFilterIndex = parts.findIndex(p => p === 'start' || p === 'end' || /^\d{2}:\d{2}$/.test(p));
              const expandedCallDetail = timeFilterIndex > 0 
                ? parts.slice(0, timeFilterIndex - 1).join('-')
                : cacheKey;
              
              // Check for new data without clearing existing data
              checkForNewCallDetails(cacheKey, cached);
            }
          });
        }, 100);
        
        return updated;
      });
    }
  }, [callDetailsRefreshKey]);
  
  // Effect to periodically check for new call details (intelligent updates)
  useEffect(() => {
    const interval = setInterval(async () => {
      setCallDetailsCache(prev => {
        // Only proceed if we have expanded call details
        if (Object.keys(prev).length === 0) return prev;
        
        // Process updates without triggering re-renders
        const hasUpdates = Object.entries(prev).some(([_, cacheData]) => 
          !cacheData.loading && !cacheData.updating && cacheData.data.length > 0
        );
        
        if (hasUpdates) {
          // Schedule update checks outside of state update
          setTimeout(async () => {
            for (const [cacheKey, cacheData] of Object.entries(prev)) {
              if (cacheData.loading || cacheData.updating || !cacheData.data.length) continue;
              
              try {
                // Set updating flag to prevent overlapping fetches
                setCallDetailsCache(current => ({
                  ...current,
                  [cacheKey]: { ...current[cacheKey], updating: true }
                }));
                
                await checkForNewCallDetails(cacheKey, cacheData);
              } catch (error) {
                console.error('🔄 Error checking for new call details:', error);
              } finally {
                // Clear updating flag
                setCallDetailsCache(current => ({
                  ...current,
                  [cacheKey]: { ...current[cacheKey], updating: false }
                }));
              }
            }
          }, 0);
        }
        
        return prev;
      });
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, [filters]); // Removed callDetailsCache from dependencies
  const [sortConfig, setSortConfig] = useState<Record<string, { key: string; direction: 'asc' | 'desc' | null }>>({});
  const [audioStates, setAudioStates] = useState<Record<string, {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    audio: HTMLAudioElement | null;
  }>>({});
  
  // Hard-coded categories directly from database
  const hardCodedCategories = {
    open: ['$assigned', '$follow_up_auto', '$follow_up_personal', '$none'],
    success: ['Termin', 'Report_Mail', 'Report_Post', 'Termin_nach_Infomail', 'selbständig_gebucht', 'Will_nicht', 'kein_Bedarf_mehr', 'Termin_nach_Email', 'PM_Gespräch', 'Email_nochmal_versenden', 'Post_nochmal_versenden', 'Termin_nach_Report', 'AP_Report_Email', 'AP_Report_Versand', 'Email_nochmal_senden', 'GK_Report_Email', 'GK_Report_Versand', 'Post_nochmal_senden', 'Kunde_sendet_Anfrage', 'Termin_bestätigt', 'Termin_verschoben', 'keine_Zeit', 'nicht_erreicht', 'will_nicht_mehr', 'Termin_Vereinbart', 'Messe', 'Termin_nach_email', 'Report_versendet'],
    declined: ['KI_Ansprechpartner', 'KI_Gatekeeper', 'Kundenhotline', 'Unternehmen_existiert_nicht', 'falsche_Zielgruppe', 'haben_bereits_Partner', 'nie_wieder_anrufen', 'Bestandskunde', 'Zentrale', 'virtuelle_Assistenz', 'doppler', 'keine_Wundversorgung', 'nur_über_Zentrale', 'unter_500', 'nur_über_Kontaktformular']
  };
  
  // Memoize categoriesMap to prevent unnecessary re-renders
  const categoriesMap = useMemo(() => {
    const map = new Map([['all', hardCodedCategories]]);
    
    // Extract unique project IDs from statistics
    const projectCampaignIds = Array.from(new Set(statistics.map(stat => stat.projectId)));
    
    // For now, use the same categories for all campaigns
    // TODO: Load project-specific categories from database
    projectCampaignIds.forEach(projectId => {
      map.set(projectId, hardCodedCategories);
    });
    
    return map;
  }, [statistics]);
  
  const categoriesLoading = false;
  
  
  
  // Update callOutcomes when dynamic categories are loaded
  useEffect(() => {
    
    if (!categoriesLoading && categoriesMap.size > 0) {
      // Get all actual outcomes from statistics to filter categories
      const allOutcomes: Record<string, number> = {};
      const uniqueProjectIds = Array.from(new Set(statistics.map(stat => stat.projectId)));
      
      statistics.forEach(stat => {
        if (stat.outcomes) {
          Object.entries(stat.outcomes).forEach(([outcome, count]) => {
            allOutcomes[outcome] = (allOutcomes[outcome] || 0) + count;
          });
        }
      });
      
      const dynamicOutcomes = createDynamicCallOutcomes(categoriesMap, allOutcomes, uniqueProjectIds);
      setCallOutcomes(dynamicOutcomes);
    } else if (!categoriesLoading && campaignIds.length === 0) {
      // FALLBACK: Use static call outcomes ONLY when no campaign IDs at all
      setCallOutcomes([]);
    } else {
    }
  }, [categoriesMap, categoriesLoading, statistics]);
  
  // Detail columns visibility is now controlled from parent component
  
  // Transcription states per call detail (key: detail.id or recordingUrl)
  const [callTranscriptionStates, setCallTranscriptionStates] = useState<Record<string, {
    status: 'idle' | 'submitting' | 'pending' | 'completed' | 'failed';
    transcript?: string;
    error?: string;
    audioFileId?: number;
  }>>({});
  
  // State for dismissing the no-calls info box
  const [dismissedInfoBox, setDismissedInfoBox] = useState(false);
  
  // State for individual project expansion is now handled via props
  
  // State for project call details statistics
  const [projectCallStatistics, setProjectCallStatistics] = useState<Record<string, any>>({});
  
  // Helper function to check for new call details without showing loading
  const checkForNewCallDetails = async (cacheKey: string, cacheData: { data: any[], loading: boolean, lastIds: string[], metadata?: any }) => {
    // FIXED: Use metadata instead of fragile cache key parsing
    if (!cacheData.metadata) {
      console.warn(`⚠️ No metadata found for cache key: ${cacheKey}. Cannot check for new call details.`);
      return;
    }
    
    const { agentId, projectId, outcomeName, timeFrom, timeTo } = cacheData.metadata;
    console.log(`🔄 Checking for new call details: agentId=${agentId}, projectId=${projectId}, outcome=${outcomeName}`);
    
    const agentStats = statistics.filter(stat => stat.agentId === agentId);
    const allProjectIds = Array.from(new Set(agentStats.map(stat => stat.projectId)));
    
    if (allProjectIds.length === 0) {
      console.log(`❌ No projectIds found for agentId=${agentId}`);
      return;
    }
    
    try {
      // FIXED: Use the same date filters as when initially loaded (from metadata context)
      const dateFromStr = filters?.dateFrom || '2025-08-01';
      const dateToStr = filters?.dateTo || filters?.dateFrom;
      
      console.log(`🗓️ Using date filters: ${dateFromStr} to ${dateToStr}`);
      console.log(`⏰ Using time filters: ${timeFrom || 'none'} to ${timeTo || 'none'}`);
      
      const params = new URLSearchParams();
      params.append('dateFrom', dateFromStr);
      if (dateToStr) params.append('dateTo', dateToStr);
      if (timeFrom) params.append('timeFrom', timeFrom);
      if (timeTo) params.append('timeTo', timeTo);
      
      // Get all current call details to find new ones
      const allCallDetailsPromises = allProjectIds.map(async (projectId) => {
        const response = await fetch(`/api/call-details/${agentId}/${projectId}?${params.toString()}`);
        return response.json();
      });
      
      const allProjectResults = await Promise.all(allCallDetailsPromises);
      const allNewCallDetails: CallDetails[] = allProjectResults.flat();
      
      // Filter for the specific outcome
      const newFilteredDetails = allNewCallDetails.filter(call => call.outcome === outcomeName);
      
      // Check if we have more entries than before
      console.log(`📊 Comparison: API returned ${newFilteredDetails.length} vs cached ${cacheData.data.length} for ${outcomeName}`);
      
      if (newFilteredDetails.length > cacheData.data.length) {
        console.log(`✨ Found ${newFilteredDetails.length - cacheData.data.length} new call details for ${outcomeName}`);
        
        // FIXED: Use content-based duplicate detection instead of unreliable IDs
        // The external API generates different IDs for the same calls, so we use content fingerprints
        const existingFingerprints = new Set(cacheData.data.map(detail => {
          // Create stable fingerprint from call content (not changing IDs)
          return `${detail.uhrzeit}-${detail.datum}-${detail.firmenname}-${detail.ansprechpartner}-${detail.gespraechsdauer}`;
        }));
        
        console.log(`🔍 Total existing fingerprints in cache: ${existingFingerprints.size}`);
        console.log(`🔍 Sample existing fingerprints:`, Array.from(existingFingerprints).slice(0, 3));
        
        const trulyNewCalls = newFilteredDetails.filter(call => {
          // Create same fingerprint format from API call data
          const callDate = new Date(call.callStart);
          const formattedDate = format(callDate, 'dd.MM.yy');
          const formattedTime = format(callDate, 'HH:mm');
          const totalSeconds = Math.round(call.duration || 0);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          
          const fingerprint = `${formattedTime}-${formattedDate}-${call.contactName || ''}-${call.contactPerson || ''}-${durationStr}`;
          const isNew = !existingFingerprints.has(fingerprint);
          
          // Debug for first 5 calls
          if (newFilteredDetails.indexOf(call) < 5) {
            console.log(`🔍 Content Comparison #${newFilteredDetails.indexOf(call) + 1}:`);
            console.log(`  Call: ${formattedTime} ${formattedDate} ${call.contactName} (${durationStr})`);
            console.log(`  Fingerprint: "${fingerprint}"`);
            console.log(`  In cache?: ${existingFingerprints.has(fingerprint)}`);
            console.log(`  Is new?: ${isNew}`);
          }
          
          if (isNew) {
            console.log(`🆕 Found truly new call based on content: ${formattedTime} ${formattedDate} ${call.contactName}`);
          } else {
            console.log(`⚠️ DUPLICATE DETECTED (content-based): Call at ${formattedTime} already exists`);
          }
          return isNew;
        });
        
        console.log(`🎯 Found ${trulyNewCalls.length} truly new calls to append`);
        
        if (trulyNewCalls.length > 0) {
          // Convert new calls to display format
          const displayDetails = trulyNewCalls.map((call: any, index: number) => {
            const date = new Date(call.callStart);
            const formattedDate = !isNaN(date.getTime()) ? format(date, 'dd.MM.yy') : '-';
            const formattedTime = !isNaN(date.getTime()) ? format(date, 'HH:mm') : '-';
            const totalSeconds = Math.round(call.duration || 0);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            return {
              anzahlAnrufe: String(cacheData.data.length + index + 1).padStart(2, '0'),
              datum: formattedDate,
              uhrzeit: formattedTime,
              gespraechsdauer: durationStr,
              // Debug columns for grouping analysis
              contacts_id: call.contactsId || '',
              contacts_campaign_id: call.contactsCampaignId || '',
              group_id: call.groupId || '',
              id: call.id,
              firmenname: call.contactName || '',
              ansprechpartner: call.contactPerson || '',
              contacts_notiz: call.notes || null,
              audio: !!call.recordingUrl,
              recordingUrl: call.recordingUrl,
              durationInSeconds: totalSeconds,
              wrapupTimeSeconds: call.wrapupTimeSeconds,
              waitTimeSeconds: call.waitTimeSeconds,
              editTimeSeconds: call.editTimeSeconds,
              duration: call.duration,
              outcomeCategory: call.outcomeCategory
            };
          });
          
          // Append new entries to existing data WITHOUT triggering loading state
          const combinedData = [...cacheData.data, ...displayDetails];
          console.log(`🔗 Combining ${cacheData.data.length} existing + ${displayDetails.length} new = ${combinedData.length} total`);
          
          // Use the existing filterAndSortCallDetails function to maintain sort order
          const sortedData = filterAndSortCallDetails(combinedData, cacheKey);
          
          // Create fingerprints for tracking instead of IDs (since IDs change)
          const newFingerprints = displayDetails.map(detail => 
            `${detail.uhrzeit}-${detail.datum}-${detail.firmenname}-${detail.ansprechpartner}-${detail.gespraechsdauer}`
          );
          
          console.log(`💾 Updating cache with ${sortedData.length} sorted entries`);
          console.log(`🔑 Adding new fingerprints:`, newFingerprints);
          
          setCallDetailsCache(prev => ({
            ...prev,
            [cacheKey]: {
              ...prev[cacheKey],
              data: sortedData,
              lastIds: [...(cacheData.lastIds || []), ...newFingerprints], // Store fingerprints instead of IDs
              metadata: cacheData.metadata // Preserve metadata
            }
          }));
          
          // Find agent name for notification
          const agent = agents.find(a => a.id === agentId);
          const agentName = agent?.name || 'Unknown Agent';
          
          // Determine notification type and status based on database lookup
          const getNotificationDetails = async (outcome: string, count: number, projectId: string) => {
            try {
              // Find the project name from project ID
              const project = projects.find(p => p.id === projectId);
              if (!project) {
                console.warn(`🔍 Project not found for ID: ${projectId}`);
                // Fallback to hardcoded logic if project not found
                const openOutcomes = ['$none', 'offen', 'open', 'Rückruf', 'Rückruf_terminiert'];
                const positiveOutcomes = ['Termin', 'Termin | Infomail', 'selbst gebucht', 'selbständig_gebucht'];
                
                if (openOutcomes.some(o => outcome.toLowerCase().includes(o.toLowerCase()))) {
                  return { message: `Neue offene Einträge für "${outcome}": ${count}`, status: 'open' as const };
                } else if (positiveOutcomes.some(o => outcome.toLowerCase().includes(o.toLowerCase()))) {
                  return { message: `Neue positive Einträge für "${outcome}": ${count}`, status: 'positive' as const };
                } else {
                  return { message: `Neue negative Einträge für "${outcome}": ${count}`, status: 'negative' as const };
                }
              }
              
              // Query the database for dynamic status using the original campaign ID
              const campaignId = project.name; // Use project name as campaign ID
              const response = await fetch(`/api/outcome-status/${campaignId}/${encodeURIComponent(outcome)}`);
              
              if (response.ok) {
                const data = await response.json();
                const dbStatus = data.status; // 'declined', 'open', 'success'
                
                let status: 'positive' | 'negative' | 'open';
                let messageType: string;
                
                if (dbStatus === 'declined') {
                  status = 'negative';
                  messageType = 'negative';
                } else if (dbStatus === 'open') {
                  status = 'open';
                  messageType = 'offene';
                } else if (dbStatus === 'success') {
                  status = 'positive';
                  messageType = 'positive';
                } else {
                  // Fallback
                  status = 'open';
                  messageType = 'unbekannte';
                }
                
                console.log(`✅ Dynamic status lookup: ${outcome} -> ${dbStatus} -> ${status}`);
                return {
                  message: `Neue ${messageType} Einträge für "${outcome}": ${count}`,
                  status
                };
              } else {
                console.warn(`🔍 Status not found for ${outcome} in campaign ${campaignId} (project: ${project.name}), using fallback`);
                // Fallback to hardcoded logic
                const openOutcomes = ['$none', 'offen', 'open', 'Rückruf', 'Rückruf_terminiert'];
                const positiveOutcomes = ['Termin', 'Termin | Infomail', 'selbst gebucht', 'selbständig_gebucht'];
                
                if (openOutcomes.some(o => outcome.toLowerCase().includes(o.toLowerCase()))) {
                  return { message: `Neue offene Einträge für "${outcome}": ${count}`, status: 'open' as const };
                } else if (positiveOutcomes.some(o => outcome.toLowerCase().includes(o.toLowerCase()))) {
                  return { message: `Neue positive Einträge für "${outcome}": ${count}`, status: 'positive' as const };
                } else {
                  return { message: `Neue negative Einträge für "${outcome}": ${count}`, status: 'negative' as const };
                }
              }
            } catch (error) {
              console.error(`❌ Error getting notification status for ${outcome}:`, error);
              // Fallback to hardcoded logic
              const openOutcomes = ['$none', 'offen', 'open', 'Rückruf', 'Rückruf_terminiert'];
              const positiveOutcomes = ['Termin', 'Termin | Infomail', 'selbst gebucht', 'selbständig_gebucht'];
              
              if (openOutcomes.some(o => outcome.toLowerCase().includes(o.toLowerCase()))) {
                return { message: `Neue offene Einträge für "${outcome}": ${count}`, status: 'open' as const };
              } else if (positiveOutcomes.some(o => outcome.toLowerCase().includes(o.toLowerCase()))) {
                return { message: `Neue positive Einträge für "${outcome}": ${count}`, status: 'positive' as const };
              } else {
                return { message: `Neue negative Einträge für "${outcome}": ${count}`, status: 'negative' as const };
              }
            }
          };
          
          // Show notification for new entries (async)
          getNotificationDetails(outcomeName, displayDetails.length, projectId).then(notificationDetails => {
            const notificationId = `${outcomeName}-${Date.now()}`;
            setNotifications(prev => ({
              ...prev,
              [notificationId]: {
                message: notificationDetails.message,
                category: outcomeName,
                count: displayDetails.length,
                visible: true,
                agentName: agentName,
                status: notificationDetails.status
              }
            }));
            
            // Auto-dismiss notification after 5 seconds
            setTimeout(() => {
              setNotifications(prev => ({
                ...prev,
                [notificationId]: {
                  ...prev[notificationId],
                  visible: false
                }
              }));
            }, 5000);
          }).catch(error => {
            console.error('❌ Error creating notification:', error);
          });
          
        }
      }
    } catch (error) {
      console.error('🔄 Error checking for new call details:', error);
    }
  };

  // Helper function to load call details for a specific key (initial load)
  const loadCallDetails = async (expandedCallDetail: string, currentFilters = filters) => {
    // FIXED: Handle UUID agent IDs correctly - find the last dash before outcome name
    const lastDashIndex = expandedCallDetail.lastIndexOf('-');
    const agentId = expandedCallDetail.substring(0, lastDashIndex);
    const outcomeName = expandedCallDetail.substring(lastDashIndex + 1);
    const agentStats = statistics.filter(stat => stat.agentId === agentId);
    const allProjectIds = Array.from(new Set(agentStats.map(stat => stat.projectId))); // Get all unique project IDs for this agent
    
    console.log(`🎯 LoadCallDetails: agentId=${agentId}, projectIds=[${allProjectIds.join(', ')}], outcome=${outcomeName}`);
    
    if (allProjectIds.length === 0) {
      console.log(`❌ No projectIds found for agentId=${agentId}`);
      return;
    }
    
    // FIXED: Use the SAME date filters as statistics - single day filter when only dateFrom is set
    const dateFromStr = currentFilters?.dateFrom || '2025-08-01'; 
    // If only dateFrom is provided, set dateTo to the same date for single day filter
    const dateToStr = currentFilters?.dateTo || (currentFilters?.dateFrom ? currentFilters.dateFrom : undefined);
    
    console.log(`🗓️ Call Details using date range: ${dateFromStr} to ${dateToStr}`);
    console.log(`🔍 Original filters:`, { dateFrom: currentFilters?.dateFrom, dateTo: currentFilters?.dateTo, timeFrom: currentFilters?.timeFrom, timeTo: currentFilters?.timeTo });
    
    // Use stable cache key
    const cacheKey = createStableCacheKey(expandedCallDetail, currentFilters);
    
    console.log(`🗂️ Using cache key: ${cacheKey}`);
    
    // Set loading state while preserving existing data
    setCallDetailsCache(prev => ({
      ...prev,
      [cacheKey]: { 
        ...(prev[cacheKey] || { data: [], lastIds: [] }), 
        loading: true, 
        updating: false 
      }
    }));
    
    try {
      const params = new URLSearchParams();
      params.append('dateFrom', dateFromStr);
      if (dateToStr) {
        params.append('dateTo', dateToStr);
      }
      
      // Add time filters from both global filters AND local time filters
      const localTimeFilter = timeFilters[expandedCallDetail];
      const effectiveTimeFrom = currentFilters?.timeFrom || localTimeFilter?.timeFrom;
      const effectiveTimeTo = currentFilters?.timeTo || localTimeFilter?.timeTo;
      
      if (effectiveTimeFrom) {
        params.append('timeFrom', effectiveTimeFrom);
        console.log(`⏰ Adding timeFrom filter: ${effectiveTimeFrom}`);
      }
      if (effectiveTimeTo) {
        params.append('timeTo', effectiveTimeTo);
        console.log(`⏰ Adding timeTo filter: ${effectiveTimeTo}`);
      }
      
      // Fetch call details from ALL projects for this agent
      console.log(`🔄 Fetching call details from ${allProjectIds.length} projects for agent`);
      const allCallDetailsPromises = allProjectIds.map(async (projectId) => {
        const response = await fetch(`/api/call-details/${agentId}/${projectId}?${params.toString()}`);
        return response.json();
      });
      
      const allProjectResults = await Promise.all(allCallDetailsPromises);
      const allCallDetails: CallDetails[] = allProjectResults.flat(); // Combine all results
      
      console.log(`🔍 API returned ${allCallDetails.length} total call details`);
      console.log(`🔍 Looking for outcome: "${outcomeName}"`);
      console.log(`🔍 Available outcomes:`, Array.from(new Set(allCallDetails.map(call => call.outcome))));
      
      
      // Show first few call details for debugging
      console.log(`🔍 Sample call details:`, allCallDetails.slice(0, 3).map(call => ({ 
        outcome: call.outcome, 
        id: call.id,
        callStart: call.callStart 
      })));
      
      console.log(`🔍 FINAL: Searching directly for outcome "${outcomeName}"`);
      
      // The API already returns mapped outcome names, so search directly
      const filteredDetails = allCallDetails.filter(call => call.outcome === outcomeName);
      
      console.log(`🎯 FINAL RESULT: Found ${filteredDetails.length} records matching "${outcomeName}"`);
      
      if (filteredDetails.length === 0 && allCallDetails.length > 0) {
        console.log(`❌ NO MATCH FOUND! Checking for similar outcomes...`);
        const availableOutcomes = Array.from(new Set(allCallDetails.map(call => call.outcome)));
        availableOutcomes.forEach(outcome => {
          if (outcome.includes(outcomeName) || outcomeName.includes(outcome)) {
            console.log(`🔍 Similar outcome found: "${outcome}" (looking for "${outcomeName}")`);
          }
        });
      }
      
      // Convert to display format  
      const displayDetails = filteredDetails.map((call: any, index: number) => {
        const date = new Date(call.callStart);
        const formattedDate = !isNaN(date.getTime()) ? format(date, 'dd.MM.yy') : '-'; // Removed dayName
        const formattedTime = !isNaN(date.getTime()) ? format(date, 'HH:mm') : '-';
        
        // Duration is in seconds (decimal format)
        const totalSeconds = Math.round(call.duration || 0);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        
        return {
          anzahlAnrufe: String(index + 1).padStart(2, '0'),
          datum: formattedDate,
          uhrzeit: formattedTime,
          gespraechsdauer: durationStr,
          // Debug columns for grouping analysis
          contacts_id: call.contactsId || '',
          contacts_campaign_id: call.contactsCampaignId || '',
          group_id: call.groupId || '',
          id: call.id,
          firmenname: call.contactName || '',
          ansprechpartner: call.contactPerson || '',
          contacts_notiz: call.notes || null,
          audio: !!call.recordingUrl,
          recordingUrl: call.recordingUrl,
          durationInSeconds: totalSeconds,
          // Test columns data - WICHTIG: Diese fehlten!
          wrapupTimeSeconds: call.wrapupTimeSeconds,
          waitTimeSeconds: call.waitTimeSeconds,
          editTimeSeconds: call.editTimeSeconds, // VBZ (s) = transactions_edit_time_sec
          duration: call.duration,
          outcomeCategory: call.outcomeCategory
        };
      }); // Show all entries (removed 20 entry limit)
      
      const lastIds = displayDetails.map(detail => detail.id);
      
      // FIXED: Store metadata to avoid fragile cache key parsing
      const metadata = {
        agentId,
        outcomeName,
        timeFrom: currentFilters?.timeFrom,
        timeTo: currentFilters?.timeTo
      };
      
      console.log(`📦 Storing cache with metadata:`, metadata);
      console.log(`📦 Cache key: ${cacheKey}`);
      console.log(`📦 Stored ${displayDetails.length} call details with ${lastIds.length} IDs`);
      
      setCallDetailsCache(prev => ({
        ...prev,
        [cacheKey]: { 
          data: displayDetails, 
          loading: false,
          updating: false,
          lastIds: lastIds,
          metadata: metadata
        }
      }));
    } catch (error) {
      console.error('Error loading call details:', error);
      setCallDetailsCache(prev => ({
        ...prev,
        [cacheKey]: { data: [], loading: false, updating: false, lastIds: [] }
      }));
    }
  };
  
  // Helper function to create stable cache key - FIXED: Include ALL relevant filters
  const createStableCacheKey = (expandedCallDetail: string, currentFilters = filters) => {
    // Include ALL filters that affect the data to prevent stale entries
    const normalizedDateFrom = currentFilters?.dateFrom || '';
    const normalizedDateTo = currentFilters?.dateTo || '';
    const normalizedTimeFrom = currentFilters?.timeFrom || '';
    const normalizedTimeTo = currentFilters?.timeTo || '';
    
    // Create comprehensive filter key to ensure cache invalidation when filters change
    const filterKey = [
      normalizedDateFrom,
      normalizedDateTo,
      normalizedTimeFrom,
      normalizedTimeTo
    ].filter(Boolean).join('-');
    
    return filterKey ? `${expandedCallDetail}-${filterKey}` : expandedCallDetail;
  };

  // Helper function to get call details for a specific key
  const getCallDetailsForKey = (expandedCallDetail: string) => {
    const cacheKey = createStableCacheKey(expandedCallDetail, filters);
    
    
    const cached = callDetailsCache[cacheKey];
    if (!cached) {
      // Load data if not cached and not currently loading
      // Pass the same filters that are used for cache key generation
      const combinedFilters = {
        ...filters,
        timeFrom: filters?.timeFrom,
        timeTo: filters?.timeTo
      };
      setTimeout(() => loadCallDetails(expandedCallDetail, combinedFilters), 0);
      return { callDetails: [], isLoading: true };
    }
    // FIXED: Only show loading during initial load - if we have data, never show loading
    const isActuallyLoading = cached.loading && cached.data.length === 0;
    return { callDetails: cached.data, isLoading: isActuallyLoading };
  };

  // Sort agents based on sortBy prop
  const sortedAgents = [...agents].sort((a, b) => {
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }
    
    // Calculate statistics for each agent
    const statsA = statistics.filter(stat => stat.agentId === a.id);
    const statsB = statistics.filter(stat => stat.agentId === b.id);
    
    if (sortBy === 'positive-desc') {
      const positiveA = statsA.reduce((sum, stat) => sum + (stat.erfolgreich || 0), 0);
      const positiveB = statsB.reduce((sum, stat) => sum + (stat.erfolgreich || 0), 0);
      return positiveB - positiveA; // Descending
    }
    
    if (sortBy === 'negative-desc') {
      const totalA = statsA.reduce((sum, stat) => sum + (stat.abgeschlossen || 0), 0);
      const positiveA = statsA.reduce((sum, stat) => sum + (stat.erfolgreich || 0), 0);
      const negativeA = totalA - positiveA;
      
      const totalB = statsB.reduce((sum, stat) => sum + (stat.abgeschlossen || 0), 0);
      const positiveB = statsB.reduce((sum, stat) => sum + (stat.erfolgreich || 0), 0);
      const negativeB = totalB - positiveB;
      
      return negativeB - negativeA; // Descending
    }
    
    return 0;
  });

  // OLD STATIC FETCH REMOVED - Now using dynamic categories in earlier useEffect

  const toggleOutcomeExpansion = (agentId: string) => {
    const newExpanded = new Set(expandedOutcomes);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
      // When closing the outcome section, also close call details for this agent only
      const newCallDetails = new Set(expandedCallDetails);
      Array.from(newCallDetails).forEach(key => {
        if (key.startsWith(agentId + '-')) {
          newCallDetails.delete(key);
        }
      });
      setExpandedCallDetails(newCallDetails);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedOutcomes(newExpanded);
  };

  const toggleAgentExpansion = (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  const toggleCallDetailsExpansion = (agentId: string, outcomeName: string) => {
    const key = `${agentId}-${outcomeName}`;
    console.log(`🚀 TOGGLE DEBUG: Toggling call details for key: ${key}`);
    console.log(`🚀 TOGGLE DEBUG: Current expandedCallDetails:`, Array.from(expandedCallDetails));
    
    const newExpanded = new Set(expandedCallDetails);
    if (newExpanded.has(key)) {
      console.log(`🚀 TOGGLE DEBUG: Collapsing key: ${key}`);
      newExpanded.delete(key);
    } else {
      console.log(`🚀 TOGGLE DEBUG: Expanding key: ${key}`);
      newExpanded.add(key);
    }
    console.log(`🚀 TOGGLE DEBUG: New expandedCallDetails:`, Array.from(newExpanded));
    setExpandedCallDetails(newExpanded);
  };

  const toggleProjectCallDetailsExpansion = (projectId: string, outcomeName: string) => {
    const key = `${projectId}-${outcomeName}`;
    const newExpanded = new Set(expandedProjectCallDetails);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedProjectCallDetails(newExpanded);
  };

  const toggleProjectExpansion = (agentId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedProjects(newExpanded);
  };
  
  const toggleIndividualProjectExpansion = (agentId: string, projectName: string) => {
    const key = `${agentId}-${projectName}`;
    const newExpanded = new Set(expandedIndividualProjects);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
      // Load project statistics when expanding
      loadProjectStatistics(agentId, projectName);
    }
    setExpandedIndividualProjects(newExpanded);
  };
  
  // Load all call details for a project and calculate statistics
  const loadProjectStatistics = async (agentId: string, projectName: string) => {
    const key = `${agentId}-${projectName}`;
    
    // Find project ID from the projectName
    const project = projects.find(p => p.name === projectName);
    if (!project) return;
    
    try {
      // Load call details for all outcomes
      const outcomes = callOutcomes.map(co => co.name);
      let allCallDetails: any[] = [];
      
      for (const outcome of outcomes) {
        const params = new URLSearchParams();
        params.append('dateFrom', filters?.dateFrom || '2025-08-01');
        if (filters?.dateTo) params.append('dateTo', filters.dateTo);
        if (filters?.timeFrom) params.append('timeFrom', filters.timeFrom);
        if (filters?.timeTo) params.append('timeTo', filters.timeTo);
        params.append('projectId', project.id);
        params.append('outcome', outcome);
        params.append('agentId', agentId);
        
        const response = await fetch(`/api/call-details?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          allCallDetails = allCallDetails.concat(data);
        }
      }
      
      // Debug first call detail to see structure
      if (allCallDetails.length > 0) {
        console.log('📊 Sample call detail:', allCallDetails[0]);
        console.log('📊 All call details count:', allCallDetails.length);
      }
      
      // Calculate statistics from call details
      // Create category lookup map to ensure consistency with outcome-details-popover
      const categoryByName = new Map(callOutcomes.map(o => [o.name, o.category]));
      
      // Count outcomes by category (with fallback to 'offen' for unknown outcomes)
      const positiveCount = allCallDetails.filter(d => 
        (categoryByName.get(d.outcome) ?? 'offen') === 'positive'
      ).length;
      const negativeCount = allCallDetails.filter(d => 
        (categoryByName.get(d.outcome) ?? 'offen') === 'negative'  
      ).length;
      const openCount = allCallDetails.filter(d => 
        (categoryByName.get(d.outcome) ?? 'offen') === 'offen'
      ).length;
      
      const stats = {
        anzahl: allCallDetails.length,
        abgeschlossen: positiveCount + negativeCount, // 🔧 FIX: Only count completed calls (positive + negative), exclude open
        erfolgreich: positiveCount,
        wartezeit: allCallDetails.reduce((sum, d) => {
          const waitTime = d.waitTimeSeconds || d.wartezeit || 0;
          return sum + (typeof waitTime === 'number' ? waitTime : 0);
        }, 0) / 3600,
        gespraechszeit: allCallDetails.reduce((sum, d) => {
          // Check all possible duration fields
          const duration = d.durationInSeconds || d.duration || d.gespraechsdauer || 0;
          return sum + (typeof duration === 'number' ? duration : 0);
        }, 0) / 3600,
        nachbearbeitungszeit: allCallDetails.reduce((sum, d) => {
          const nbz = d.nachbearbeitungszeit || d.nachbearbeitung || 0;
          return sum + (typeof nbz === 'number' ? nbz : 0);
        }, 0) / 3600,
        vorbereitungszeit: allCallDetails.reduce((sum, d) => {
          const vbz = d.vorbereitungszeit || d.vorbereitung || 0;
          return sum + (typeof vbz === 'number' ? vbz : 0);
        }, 0) / 3600,
        arbeitszeit: 0,
        erfolgProStunde: 0
      };
      
      console.log('📊 Calculated project stats:', stats);
      
      // Calculate Arbeitszeit
      stats.arbeitszeit = stats.wartezeit + stats.gespraechszeit + stats.nachbearbeitungszeit + stats.vorbereitungszeit;
      
      // Calculate Erfolg/h
      stats.erfolgProStunde = stats.arbeitszeit > 0 ? stats.erfolgreich / stats.arbeitszeit : 0;
      
      setProjectCallStatistics(prev => ({
        ...prev,
        [key]: stats
      }));
    } catch (error) {
      console.error('Failed to load project statistics:', error);
    }
  };
  
  // Removed auto-load useEffect as we now calculate statistics directly from projectStats

  const handleDurationFilterToggle = (callDetailKey: string, duration: '0-30' | '30-60' | '1-5' | '5-10' | '10+') => {
    const currentFilters = durationFilters[callDetailKey] || [];
    const newFilters = currentFilters.includes(duration)
      ? currentFilters.filter(d => d !== duration)
      : [...currentFilters, duration];
    
    setDurationFilters(prev => ({
      ...prev,
      [callDetailKey]: newFilters
    }));
  };

  const getDurationFilterLabel = (callDetailKey: string) => {
    const filters = durationFilters[callDetailKey] || [];
    if (filters.length === 0) return 'Alle Anrufe';
    if (filters.length === 1) {
      const filter = filters[0];
      switch (filter) {
        case '0-30': return '0-30 Sek';
        case '30-60': return '30-60 Sek';
        case '1-5': return '1-5 Min';
        case '5-10': return '5-10 Min';
        case '10+': return '>10 Min';
        default: return 'Filter';
      }
    }
    return `${filters.length} Filter`;
  };

  const clearDurationFilters = (callDetailKey: string) => {
    setDurationFilters(prev => ({
      ...prev,
      [callDetailKey]: []
    }));
  };

  // Time filter functions
  const handleTimeFilterChange = (callDetailKey: string, field: 'timeFrom' | 'timeTo', value: string) => {
    setTimeFilters(prev => ({
      ...prev,
      [callDetailKey]: {
        ...prev[callDetailKey],
        [field]: value
      }
    }));
  };

  const getTimeFilterLabel = (callDetailKey: string) => {
    const filter = timeFilters[callDetailKey];
    if (!filter || (!filter.timeFrom && !filter.timeTo)) return 'Alle Zeiten';
    if (filter.timeFrom && filter.timeTo) return `${filter.timeFrom} - ${filter.timeTo}`;
    if (filter.timeFrom) return `ab ${filter.timeFrom}`;
    if (filter.timeTo) return `bis ${filter.timeTo}`;
    return 'Zeit Filter';
  };

  const clearTimeFilters = (callDetailKey: string) => {
    setTimeFilters(prev => ({
      ...prev,
      [callDetailKey]: {}
    }));
  };

  const handleSort = (callDetailKey: string, columnKey: string) => {
    setSortConfig(prev => {
      const currentSort = prev[callDetailKey];
      let newDirection: 'asc' | 'desc' | null = 'asc';
      
      if (currentSort?.key === columnKey) {
        if (currentSort.direction === 'asc') {
          newDirection = 'desc';
        } else if (currentSort.direction === 'desc') {
          newDirection = null;
        }
      }
      
      return {
        ...prev,
        [callDetailKey]: newDirection ? { key: columnKey, direction: newDirection } : { key: '', direction: null }
      };
    });
  };

  const filterAndSortCallDetails = (callDetails: any[], callDetailKey: string) => {
    // Apply filters first - preserve all fields including groupId
    let filtered = callDetails.map(detail => ({...detail})); // Create shallow copies to preserve all fields
    
    // Apply duration filter
    const activeDurationFilters = durationFilters[callDetailKey] || [];
    if (activeDurationFilters.length > 0) {
      filtered = filtered.filter(detail => 
        matchesDurationFilter(detail.gespraechsdauer, activeDurationFilters)
      );
    }
    
    // Apply time filter
    const activeTimeFilter = timeFilters[callDetailKey];
    if (activeTimeFilter) {
      filtered = filtered.filter(detail => 
        matchesTimeFilter(detail.uhrzeit, activeTimeFilter)
      );
    }
    
    // Apply sorting
    const sortState = sortConfig[callDetailKey];
    if (!sortState || !sortState.direction || !sortState.key) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      let aValue = a[sortState.key];
      let bValue = b[sortState.key];
      
      // Special handling for different data types
      if (sortState.key === 'datum') {
        // Convert DD.MM.YYYY to Date for comparison
        const parseDate = (dateStr: string) => {
          const [day, month, year] = dateStr.split('.');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        };
        aValue = parseDate(aValue);
        bValue = parseDate(bValue);
      } else if (sortState.key === 'uhrzeit') {
        // Convert HH:MM to minutes for comparison
        const parseTime = (timeStr: string) => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };
        aValue = parseTime(aValue);
        bValue = parseTime(bValue);
      } else if (sortState.key === 'gespraechsdauer') {
        // Convert MM:SS to seconds for comparison
        aValue = durationToSeconds(aValue);
        bValue = durationToSeconds(bValue);
      } else if (sortState.key === 'anzahlAnrufe') {
        // Convert to number
        aValue = parseInt(aValue);
        bValue = parseInt(bValue);
      }
      
      let comparison = 0;
      if (aValue > bValue) {
        comparison = 1;
      } else if (aValue < bValue) {
        comparison = -1;
      }
      
      return sortState.direction === 'desc' ? comparison * -1 : comparison;
    });
  };

  // Extract status from outcome data with robust field checking and normalization
  const getOutcomeStatus = (outcomeName: string, outcomeData?: any): 'success' | 'declined' | 'open' | 'unknown' => {
    // CRITICAL: Check for open outcomes BEFORE normalization to preserve exact case
    if (['$none', '$follow_up_auto', '$follow_up_personal', '$assigned'].includes(outcomeName)) {
      return 'open';
    }
    
    // Normalize inputs
    const normalizedName = outcomeName?.toLowerCase()?.trim() || '';
    
    // Check primary backend fields first
    if (outcomeData?.transactions_status) {
      const status = outcomeData.transactions_status.toLowerCase().trim();
      if (['success', 'positive', 'positiv'].includes(status)) return 'success';
      if (['declined', 'negative', 'negativ'].includes(status)) return 'declined';
      if (['open', 'offen'].includes(status)) return 'open';
    }
    
    // Check direct status field with synonyms
    if (outcomeData?.status) {
      const status = outcomeData.status.toLowerCase().trim();
      if (['success', 'positive', 'positiv'].includes(status)) return 'success';
      if (['declined', 'negative', 'negativ'].includes(status)) return 'declined';
      if (['open', 'offen'].includes(status)) return 'open';
    }
    
    // Check category field (from schema: 'positive' | 'negative' or German variants)
    if (outcomeData?.category || outcomeData?.outcomeCategory) {
      const category = (outcomeData.category || outcomeData.outcomeCategory).toLowerCase().trim();
      if (['positive', 'positiv'].includes(category)) return 'success';
      if (['negative', 'negativ'].includes(category)) return 'declined';
      if (['offen', 'open'].includes(category)) return 'open';
    }
    
    // Parse status from label suffix like "Termin (success)" with flexible whitespace handling
    if (normalizedName) {
      const statusMatch = normalizedName.match(/\((success|declined|open|positive|negative|positiv|negativ|offen)\)\s*$/i);
      if (statusMatch) {
        const status = statusMatch[1].toLowerCase();
        if (['success', 'positive', 'positiv'].includes(status)) return 'success';
        if (['declined', 'negative', 'negativ'].includes(status)) return 'declined';
        if (['open', 'offen'].includes(status)) return 'open';
      }
    }
    
    // Fallback: Use specific outcome name patterns for open outcomes
    if (normalizedName) {
      // Check for specific open outcome patterns (these are the system status codes for "open" outcomes)
      if (['$none', '$follow_up_auto', '$follow_up_personal', '$assigned'].includes(normalizedName)) {
        return 'open';
      }
      
      // Check for common success patterns
      if (['termin', 'selbständig_gebucht', 'report_mail', 'report_post', 'termin_nach_infomail'].includes(normalizedName)) {
        return 'success';
      }
      
      // Check for common declined patterns
      if (normalizedName.includes('ki_') || 
          ['falsche_zielgruppe', 'nie_wieder_anrufen', 'haben_bereits_partner', 'kundenhotline', 
           'unternehmen_existiert_nicht', 'zentrale', 'virtuelle_assistenz', 'bestandskunde',
           'doppler', 'keine_wundversorgung', 'nur_über_zentrale', 'nur_über_kontaktformular',
           'unter_500'].includes(normalizedName)) {
        return 'declined';
      }
    }
    
    return 'unknown';
  };

  // Get color and icon for outcome category based on status
  const getCategoryStyle = (outcomeName: string, outcomeData?: any, projectId?: string) => {
    if (!outcomeName) return {
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      textColor: 'text-gray-600 dark:text-gray-400',
      borderColor: 'border-gray-300 dark:border-gray-600',
      headerBg: 'bg-gray-50 dark:bg-gray-800',
      dotColor: 'bg-gray-400'
    };
    
    const status = getOutcomeStatus(outcomeName, outcomeData);
    
    // Green styling for successful outcomes
    if (status === 'success') {
      return {
        borderColor: 'border-green-200 dark:border-green-800',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        headerBg: 'bg-green-100 dark:bg-green-800/30',
        textColor: 'text-green-800 dark:text-green-200',
        icon: <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
      };
    }
    // Red styling for declined outcomes
    else if (status === 'declined') {
      return {
        borderColor: 'border-red-200 dark:border-red-800',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        headerBg: 'bg-red-100 dark:bg-red-800/30',
        textColor: 'text-red-800 dark:text-red-200',
        icon: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
      };
    }
    // Blue styling for open outcomes  
    else if (status === 'open') {
      return {
        borderColor: 'border-blue-200 dark:border-blue-800',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        headerBg: 'bg-blue-100 dark:bg-blue-800/30',
        textColor: 'text-blue-800 dark:text-blue-200',
        icon: <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      };
    }
    // Default gray styling for unknown outcomes
    else {
      return {
        borderColor: 'border-gray-200 dark:border-gray-800',
        bgColor: 'bg-gray-50 dark:bg-gray-900/20',
        headerBg: 'bg-gray-100 dark:bg-gray-800/30',
        textColor: 'text-gray-800 dark:text-gray-200',
        icon: <AlertCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
      };
    }
  };

  // Convert duration string to seconds
  const durationToSeconds = (durationStr: string): number => {
    const [minutes, seconds] = durationStr.split(':').map(Number);
    return (minutes * 60) + seconds;
  };

  // Check if duration matches filter criteria
  const matchesDurationFilter = (durationStr: string, durationFilters: string[]): boolean => {
    if (!durationFilters || durationFilters.length === 0) return true;
    
    const durationInSeconds = durationToSeconds(durationStr);
    
    return durationFilters.some(filter => {
      switch (filter) {
        case '0-30': return durationInSeconds >= 0 && durationInSeconds <= 30;
        case '30-60': return durationInSeconds > 30 && durationInSeconds <= 60;
        case '1-5': return durationInSeconds > 60 && durationInSeconds <= 300;
        case '5-10': return durationInSeconds > 300 && durationInSeconds <= 600;
        case '10+': return durationInSeconds > 600;
        default: return true;
      }
    });
  };

  // Check if time matches filter criteria
  const matchesTimeFilter = (timeStr: string, timeFilter: { timeFrom?: string; timeTo?: string }): boolean => {
    if (!timeFilter || (!timeFilter.timeFrom && !timeFilter.timeTo)) return true;
    
    // Convert time to minutes since midnight for comparison
    const timeToMinutes = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    const callTimeMinutes = timeToMinutes(timeStr);
    
    if (timeFilter.timeFrom && timeFilter.timeTo) {
      const fromMinutes = timeToMinutes(timeFilter.timeFrom);
      const toMinutes = timeToMinutes(timeFilter.timeTo);
      return callTimeMinutes >= fromMinutes && callTimeMinutes <= toMinutes;
    }
    
    if (timeFilter.timeFrom) {
      const fromMinutes = timeToMinutes(timeFilter.timeFrom);
      return callTimeMinutes >= fromMinutes;
    }
    
    if (timeFilter.timeTo) {
      const toMinutes = timeToMinutes(timeFilter.timeTo);
      return callTimeMinutes <= toMinutes;
    }
    
    return true;
  };

  // Helper functions for real call details
  const formatCallDateTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return { datum: '-', uhrzeit: '-' };
    }
    const formattedDate = format(date, 'dd.MM.yy');
    const formattedTime = format(date, 'HH:mm');
    // Remove any existing " h" from the time
    const cleanTime = formattedTime.replace(/ h$/, '');
    return { 
      datum: formattedDate, 
      uhrzeit: cleanTime
    };
  };
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Get real call details for specific outcome and agent/project
  const getRealCallDetails = (agentId: string, projectId: string, outcomeName: string, callDetails: CallDetails[], callDetailKey: string) => {
    return callDetails
      .filter(call => call.outcome === outcomeName)
      .map((call, index) => {
        const { datum, uhrzeit } = formatCallDateTime(call.callStart.toString());
        const duration = formatDuration(call.duration || 0);
        
        // Apply duration filtering
        const activeFilters = durationFilters[callDetailKey] || [];
        if (activeFilters.length > 0 && !matchesDurationFilter(duration, activeFilters)) {
          return null;
        }
        
        const finalObject = {
          ...call, // Keep ALL original fields including groupId, contactsId, contactsCampaignId, recordingsDate
          anzahlAnrufe: String(index + 1).padStart(2, '0'),
          datum,
          uhrzeit,
          gespraechsdauer: duration,
          // Debug columns for grouping analysis
          contacts_id: call.contactsId || '',
          contacts_campaign_id: call.contactsCampaignId || '',
          group_id: call.groupId || '',
          id: call.id,
          firmenname: call.contactName || '',
          ansprechpartner: call.contactPerson || '',
          contacts_notiz: call.notes || null,
          audio: !!call.recordingUrl,
          recordingUrl: call.recordingUrl,
          durationInSeconds: Number(call.duration) || 0 // Ensure it's a number
        };
        
        
        return finalObject;
      })
      .filter(item => item !== null)
      .slice(0, 20); // Limit to 20 entries for display
  };

  const getAgentName = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.name || `Agent ${agentId}`;
  };

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || `Projekt ${projectId}`;
  };

  const getAgentStatus = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent?.currentStatus || 'wartet';
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'im_gespraech': return 'Im Gespräch';
      case 'nachbearbeitung': return 'Nachbearbeitungszeit';
      case 'vorbereitung': return 'Vorbereitungszeit';
      case 'wartet': return 'Wartet auf Anrufstart';
      default: return 'Unbekannt';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'im_gespraech': return 'bg-green-500';
      case 'nachbearbeitung': return 'bg-yellow-500';
      case 'vorbereitung': return 'bg-blue-500';
      case 'wartet': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  // Helper function to format agent names with "und" before the last name
  const formatAgentNames = (agentNames: string[]) => {
    if (agentNames.length === 0) return '';
    
    // Sort names alphabetically (A-Z) regardless of filter order
    const sortedNames = [...agentNames].sort((a, b) => a.localeCompare(b));
    
    if (sortedNames.length === 1) return `<b>${sortedNames[0]}</b>`;
    if (sortedNames.length === 2) return `<b>${sortedNames[0]}</b> und <b>${sortedNames[1]}</b>`;
    
    const lastAgent = sortedNames[sortedNames.length - 1];
    const otherAgents = sortedNames.slice(0, -1).map(name => `<b>${name}</b>`).join(', ');
    return `${otherAgents} und <b>${lastAgent}</b>`;
  };

  // Group statistics by agent
  const agentGroups = statistics.reduce((acc, stat) => {
    if (!acc[stat.agentId]) {
      acc[stat.agentId] = [];
    }
    acc[stat.agentId].push(stat);
    return acc;
  }, {} as Record<string, AgentStatistics[]>);

  // If specific agents are selected, show only those, otherwise show no agents
  const agentsToShow = filters.agentIds && filters.agentIds.length > 0 
    ? sortedAgents.filter(agent => filters.agentIds!.includes(agent.id))
    : [];

  const getSortLabel = (sortBy: string) => {
    switch (sortBy) {
      case 'name-asc': return 'Name A-Z';
      case 'name-desc': return 'Name Z-A';
      case 'positive-desc': return 'Positiv ↓';
      case 'negative-desc': return 'Negativ ↓';
      default: return 'Sortieren';
    }
  };

  // Debug: Log filter values (commented out to prevent infinite loop)
  // console.log('AgentStatisticsTable filters:', {
  //   dateFrom: filters?.dateFrom,
  //   dateTo: filters?.dateTo,
  //   dateFromType: typeof filters?.dateFrom,
  //   dateToType: typeof filters?.dateTo,
  //   dateFromLength: filters?.dateFrom?.length,
  //   dateToLength: filters?.dateTo?.length
  // });

  // These message handling conditions are now managed at the Dashboard level
  // to have better access to local state variables for proper messaging logic

  // Separate agents with and without calls
  const agentsWithCalls = agentsToShow.filter(agent => {
    const agentStats = agentGroups[agent.id] || [];
    const totalCalls = agentStats.reduce((total, stat) => total + stat.abgeschlossen, 0);
    return totalCalls > 0;
  });

  const agentsWithoutCalls = agentsToShow.filter(agent => {
    const agentStats = agentGroups[agent.id] || [];
    const totalCalls = agentStats.reduce((total, stat) => total + stat.abgeschlossen, 0);
    return totalCalls === 0;
  });

  return (
    <>
      {/* Notifications */}
      {Object.entries(notifications).map(([id, notification]) => (
        <CallNotification
          key={id}
          message={notification.message}
          category={notification.category}
          count={notification.count}
          isVisible={notification.visible}
          agentName={notification.agentName}
          status={notification.status}
          onDismiss={() => {
            setNotifications(prev => {
              const updated = { ...prev };
              delete updated[id];
              return updated;
            });
          }}
        />
      ))}
      
      <div className="space-y-6">
      {/* Header with count and sorting */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {agentsWithCalls.length} {agentsWithCalls.length === 1 ? 'Agent' : 'Agenten'} 
          {agentsWithCalls.length > 0 ? ' mit Anrufdaten' : ''}
        </div>
        {/* Sorting Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={`text-xs ${agentsWithCalls.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={agentsWithCalls.length <= 1}
              >
                <ArrowUpDown className="w-3 h-3 mr-2" />
                {getSortLabel(sortBy)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSortChange?.('positive-desc')}>
                Positiv ↓
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSortChange?.('negative-desc')}>
                Negativ ↓
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSortChange?.('name-asc')}>
                Name A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSortChange?.('name-desc')}>
                Name Z-A
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>
      
      {/* Show message for agents without calls */}
      {agentsWithoutCalls.length > 0 && !dismissedInfoBox && hasSearched && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 relative">
          <div className="flex items-start space-x-2 pr-8">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
{t('emptyStates.noProjectsInTimeframe')}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
{t(agentsWithoutCalls.length === 1 ? 'emptyStates.forAgent' : 'emptyStates.forAgents')}: {' '}
                <span 
                  className="font-medium"
                  dangerouslySetInnerHTML={{
                    __html: formatAgentNames(agentsWithoutCalls.map(agent => agent.name))
                  }}
                />
{' '}{t('emptyStates.noCallDataForAgents')}
              </p>
            </div>
          </div>
          {/* Close Button */}
          <button
            onClick={() => setDismissedInfoBox(true)}
            className="absolute top-3 right-3 p-1 hover:bg-yellow-200 dark:hover:bg-yellow-800/50 rounded-md transition-colors"
            title="Meldung schließen"
            data-testid="button-close-info-box"
          >
            <X className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          </button>
        </div>
      )}
      
      {agentsWithCalls.map((agent) => {
        const agentStats = agentGroups[agent.id] || [];
        const isExpanded = expandedAgents.has(agent.id);
        const agentStatus = getAgentStatus(agent.id);
        
        // Calculate project groups for rowspan
        const projectGroups = agentStats.reduce((acc, stat) => {
          if (!acc[stat.projectId]) {
            acc[stat.projectId] = [];
          }
          acc[stat.projectId].push(stat);
          return acc;
        }, {} as Record<string, AgentStatistics[]>);
        
        const projectCount = Object.keys(projectGroups).length;
        const agentNameRowSpan = 2; // Only header + main data row

        // Aggregate stats for the agent across all projects and dates
        const totalStats = agentStats.reduce((total, stat) => ({
          anzahl: total.anzahl + stat.anzahl,
          abgeschlossen: total.abgeschlossen + stat.abgeschlossen,
          erfolgreich: total.erfolgreich + stat.erfolgreich,
          wartezeit: total.wartezeit + stat.wartezeit,
          gespraechszeit: total.gespraechszeit + stat.gespraechszeit,
          nachbearbeitungszeit: total.nachbearbeitungszeit + stat.nachbearbeitungszeit,
          vorbereitungszeit: total.vorbereitungszeit + stat.vorbereitungszeit,
          erfolgProStunde: total.erfolgProStunde + stat.erfolgProStunde,
          arbeitszeit: total.arbeitszeit + stat.arbeitszeit,
        }), {
          anzahl: 0, abgeschlossen: 0, erfolgreich: 0, wartezeit: 0,
          gespraechszeit: 0, nachbearbeitungszeit: 0, vorbereitungszeit: 0,
          erfolgProStunde: 0, arbeitszeit: 0
        });

        // Get date range from filters (same logic as header)
        const getDateRange = () => {
          if (filters.dateFrom && filters.dateTo) {
            const fromDate = new Date(filters.dateFrom);
            const toDate = new Date(filters.dateTo);
            const sameYear = fromDate.getFullYear() === toDate.getFullYear();
            
            const fromFormatted = fromDate.toLocaleDateString(t('common.locale'), { 
              day: '2-digit', 
              month: '2-digit', 
              year: sameYear ? undefined : 'numeric' 
            });
            const toFormatted = toDate.toLocaleDateString(t('common.locale'), { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            // If same date, show only one date
            if (filters.dateFrom === filters.dateTo) {
              return toFormatted;
            } else {
              return `${fromFormatted} - ${toFormatted}`;
            }
          } else if (filters.dateFrom) {
            const fromFormatted = new Date(filters.dateFrom).toLocaleDateString(t('common.locale'), { day: '2-digit', month: '2-digit', year: 'numeric' });
            // Check if dateTo is empty or just whitespace
            const hasDateTo = filters.dateTo && filters.dateTo.trim() !== '';
            // FIXED: Don't show "Ab" for single day filters (backend now sets dateTo = dateFrom)
            // If only dateFrom is set, show just the date without "Ab"
            return fromFormatted;
          } else if (filters.dateTo) {
            const toFormatted = new Date(filters.dateTo).toLocaleDateString(t('common.locale'), { day: '2-digit', month: '2-digit', year: 'numeric' });
            return `${t('common.until')} ${toFormatted}`;
          } else {
            return t('common.noData');
          }
        };

        return (
          <div key={agent.id} className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Statistics Table */}
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="text-xs font-bold tracking-wider text-foreground text-center align-middle px-4 py-2 border-r w-32 min-w-32 max-w-32" rowSpan={2}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 hover:bg-accent text-foreground text-xs font-bold tracking-wider w-full truncate"
                        onClick={() => toggleAgentExpansion(agent.id)}
                        data-testid={`button-expand-${agent.id}`}
                      >
                        <div className="flex items-center w-full">
                          {totalStats.abgeschlossen > 0 && (
                            isExpanded ? (
                              <Minus className="w-3 h-3 mr-1 flex-shrink-0" />
                            ) : (
                              <Plus className="w-3 h-3 mr-1 flex-shrink-0" />
                            )
                          )}
                          <span className="truncate">{agent.name}</span>
                        </div>
                      </Button>
                    </th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 w-40 min-w-40" title="Datum">Datum</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-20" title="negative, positive und offene Anrufe">Anzahl</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-28" title="negative und positive Abschlüsse">abgeschlossen</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-24" title="positiv abgeschlossen">erfolgreich</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-16" title="Wartezeit (Dialer) in Stunden">WZ (h)</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-16" title="Gesprächszeit (Dialer) in Stunden">GZ (h)</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-16" title="Nachbearbeitungszeit in Stunden">NBZ (h)</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-16" title="Vorbereitungszeit in Stunden">VBZ (h)</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-20" title="Erfolg pro Stunde">Erfolg/h</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-right w-16" title="Arbeitszeit in Stunden">AZ (h)</th>
                    <th className="text-xs font-medium tracking-wider text-foreground px-4 py-2 text-center w-12">
                      <button
                        onClick={() => {
                          // Remove agent from the filter selection (like unchecking in dropdown)
                          if (onFilterChange && filters.agentIds) {
                            const newAgentIds = filters.agentIds.filter((id: string) => id !== agent.id);
                            onFilterChange({
                              ...filters,
                              agentIds: newAgentIds.length > 0 ? newAgentIds : undefined
                            });
                          }
                          // Also clear any expanded state for this agent
                          const newExpandedAgents = new Set(expandedAgents);
                          newExpandedAgents.delete(agent.id);
                          setExpandedAgents(newExpandedAgents);
                          const newExpandedOutcomes = new Set(expandedOutcomes);
                          newExpandedOutcomes.delete(agent.id);
                          setExpandedOutcomes(newExpandedOutcomes);
                          const newExpandedCallDetails = new Set(expandedCallDetails);
                          // Remove all call details that start with this agent's ID
                          Array.from(newExpandedCallDetails).forEach((key: string) => {
                            if (key.startsWith(agent.id + '-')) {
                              newExpandedCallDetails.delete(key);
                            }
                          });
                          setExpandedCallDetails(newExpandedCallDetails);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        title="Agent schließen"
                        data-testid={`button-close-agent-${agent.id}`}
                      >
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    </th>
                  </tr>
                  <tr className="hover:bg-accent transition-colors">
                    <td className="px-4 py-2 text-sm font-bold whitespace-nowrap" data-testid={`cell-date-range-${agent.id}`}>{getDateRange()}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-anzahl-${agent.id}`}>{totalStats.anzahl}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-abgeschlossen-${agent.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 hover:bg-transparent text-sm font-bold"
                        onClick={() => toggleOutcomeExpansion(agent.id)}
                        data-testid={`button-outcomes-${agent.id}`}
                      >
                        {totalStats.abgeschlossen}
                        {totalStats.abgeschlossen > 0 && (
                          expandedOutcomes.has(agent.id) ? (
                            <Minus className="w-3 h-3 ml-1" />
                          ) : (
                            <Plus className="w-3 h-3 ml-1" />
                          )
                        )}
                      </Button>
                    </td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-erfolgreich-${agent.id}`}>{totalStats.erfolgreich}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-wartezeit-${agent.id}`}>{(totalStats.wartezeit || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-gespraechszeit-${agent.id}`}>{(totalStats.gespraechszeit || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-nachbearbeitung-${agent.id}`}>{(totalStats.nachbearbeitungszeit || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-vorbereitung-${agent.id}`}>{(totalStats.vorbereitungszeit || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-erfolg-${agent.id}`}>{(totalStats.erfolgProStunde || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-right" data-testid={`cell-arbeitszeit-${agent.id}`}>{(totalStats.arbeitszeit || 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-center">
                      {/* Close button moved to header */}
                    </td>
                  </tr>

                  {/* Outcome Details Row */}
                  {expandedOutcomes.has(agent.id) && (
                    <tr className="bg-blue-25 dark:bg-blue-900/10">
                      <td colSpan={12} className="px-4 py-4">
                        <div className="bg-white dark:bg-gray-800 border-2 border-blue-200 rounded-lg p-4">
                          <div className="grid grid-cols-3 gap-6">
                          {(() => {
                            const allOutcomes = agentStats.reduce((acc, stat) => {
                              Object.entries(stat.outcomes || {}).forEach(([key, value]) => {
                                acc[key] = (acc[key] || 0) + value;
                              });
                              return acc;
                            }, {} as Record<string, number>);
                            
                            console.log(`🔍 RIGHT PANEL DEBUG: Agent ${agent.name} has ${agentStats.length} statistics`);
                            console.log(`🔍 RIGHT PANEL DEBUG: allOutcomes for agent:`, JSON.stringify(allOutcomes, null, 2));

                            const negativeOutcomes = callOutcomes.filter(co => co.category === 'negative');
                            const positiveOutcomes = callOutcomes.filter(co => co.category === 'positive');
                            const offenOutcomes = callOutcomes.filter(co => co.category === 'offen');

                            // 🎯 FIXED: Use dynamic classification instead of static CallOutcome matching
                            let negativeTotal = 0, positiveTotal = 0, offenTotal = 0;
                            Object.entries(allOutcomes).forEach(([outcomeName, count]) => {
                              const category = classifyOutcome(outcomeName, 'all');
                              console.log(`📊 TABLE CLASSIFY: "${outcomeName}" (${count}) -> ${category}`);
                              
                              if (category === 'negative') {
                                negativeTotal += count;
                              } else if (category === 'positive') {
                                positiveTotal += count;
                              } else {
                                offenTotal += count;
                              }
                            });

                            if (statisticsLoading || categoriesLoading) {
                              return (
                                <div className="col-span-3 flex items-center justify-center h-32">
                                  <div className="text-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-800 dark:border-gray-200 mx-auto mb-2"></div>
                                    <p className="text-sm text-gray-800 dark:text-gray-200">Lade Anrufinformationen...</p>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                  <h6 className="font-medium mb-2 text-red-600 flex items-center text-sm">
                                    <ThumbsDown className="w-3 h-3 mr-1" />
                                    Negativ ({negativeTotal})
                                  </h6>
                                  <div className="space-y-1">
                                    {negativeOutcomes.map(outcome => (
                                      <div key={outcome.id}>
                                        <div className="flex items-center text-xs">
                                          <div className="w-6 flex justify-center mr-1">
                                            {(allOutcomes[outcome.name] || 0) > 0 ? (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleCallDetailsExpansion(agent.id, outcome.name);
                                                }}
                                                className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                title={`Details für ${outcome.name} ${expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                              >
                                                {expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? (
                                                  <Minus className="h-3.5 w-3.5 text-gray-500" />
                                                ) : (
                                                  <Plus className="h-3.5 w-3.5 text-gray-500" />
                                                )}
                                              </button>
                                            ) : null}
                                          </div>
                                          {(allOutcomes[outcome.name] || 0) > 0 ? (
                                            <button 
                                              className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors rounded-md px-0.5 text-left flex-1"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCallDetailsExpansion(agent.id, outcome.name);
                                              }}
                                              title={`Details für ${outcome.name} ${expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                            >
                                              {outcome.name}
                                            </button>
                                          ) : (
                                            <span className="text-gray-400 px-0.5 text-left flex-1">
                                              {outcome.name}
                                            </span>
                                          )}
                                          <span className="font-mono ml-auto">{allOutcomes[outcome.name] || 0}</span>
                                        </div>

                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                  <h6 className="font-medium mb-2 text-green-600 flex items-center text-sm">
                                    <ThumbsUp className="w-3 h-3 mr-1" />
                                    Positiv ({positiveTotal})
                                  </h6>
                                  <div className="space-y-1">
                                    {positiveOutcomes.map(outcome => (
                                      <div key={outcome.id}>
                                        <div className="flex items-center text-xs">
                                          <div className="w-6 flex justify-center mr-1">
                                            {(allOutcomes[outcome.name] || 0) > 0 ? (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleCallDetailsExpansion(agent.id, outcome.name);
                                                }}
                                                className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                title={`Details für ${outcome.name} ${expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                              >
                                                {expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? (
                                                  <Minus className="h-3.5 w-3.5 text-gray-500" />
                                                ) : (
                                                  <Plus className="h-3.5 w-3.5 text-gray-500" />
                                                )}
                                              </button>
                                            ) : null}
                                          </div>
                                          {(allOutcomes[outcome.name] || 0) > 0 ? (
                                            <button 
                                              className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors rounded-md px-0.5 text-left flex-1"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCallDetailsExpansion(agent.id, outcome.name);
                                              }}
                                              title={`Details für ${outcome.name} ${expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                            >
                                              {outcome.name}
                                            </button>
                                          ) : (
                                            <span className="text-gray-400 px-0.5 text-left flex-1">
                                              {outcome.name}
                                            </span>
                                          )}
                                          <span className="font-mono ml-auto">{allOutcomes[outcome.name] || 0}</span>
                                        </div>

                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                  <h6 className="font-medium mb-2 text-blue-600 flex items-center text-sm">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Offen ({offenTotal})
                                  </h6>
                                  <div className="space-y-1">
                                    {offenOutcomes.map(outcome => (
                                      <div key={outcome.id}>
                                        <div className="flex items-center text-xs">
                                          <div className="w-6 flex justify-center mr-1">
                                            {(allOutcomes[outcome.name] || 0) > 0 ? (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleCallDetailsExpansion(agent.id, outcome.name);
                                                }}
                                                className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                title={`Details für ${outcome.name} ${expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                              >
                                                {expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? (
                                                  <Minus className="h-3.5 w-3.5 text-gray-500" />
                                                ) : (
                                                  <Plus className="h-3.5 w-3.5 text-gray-500" />
                                                )}
                                              </button>
                                            ) : null}
                                          </div>
                                          {(allOutcomes[outcome.name] || 0) > 0 ? (
                                            <button 
                                              className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors rounded-md px-0.5 text-left flex-1"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCallDetailsExpansion(agent.id, outcome.name);
                                              }}
                                              title={`Details für ${outcome.name} ${expandedCallDetails.has(`${agent.id}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                            >
                                              {outcome.name}
                                            </button>
                                          ) : (
                                            <span className="text-gray-400 px-0.5 text-left flex-1">
                                              {outcome.name}
                                            </span>
                                          )}
                                          <span className="font-mono ml-auto">{allOutcomes[outcome.name] || 0}</span>
                                        </div>

                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Call Details Rows - shown when outcomes are expanded AND agent's outcome section is expanded */}
                  {Array.from(expandedCallDetails)
                    .filter(key => key.startsWith(agent.id + '-') && expandedOutcomes.has(agent.id))
                    .map(expandedCallDetail => (
                    <tr key={expandedCallDetail} className="bg-gray-50 dark:bg-gray-900">
                      <td colSpan={12} className="px-4 py-4">
                        {(() => {
                          const outcomeName = expandedCallDetail.substring(agent.id.length + 1);
                          
                          // Calculate if there are call details for this outcome
                          const agentStats = statistics.filter(stat => stat.agentId === agent.id);
                          const allOutcomes = agentStats.reduce((acc, stat) => {
                            Object.entries(stat.outcomes || {}).forEach(([key, value]) => {
                              acc[key] = (acc[key] || 0) + value;
                            });
                            return acc;
                          }, {} as Record<string, number>);
                          
                          const callDetailsCount = allOutcomes[outcomeName] || 0;
                          const hasCallDetails = callDetailsCount > 0;
                          
                          // Get the first project ID for this agent to load call details
                          const agentProjectId = agentStats.length > 0 ? agentStats[0].projectId : '';
                          
                          // Get cached data or trigger loading via the proper function
                          const expandedKey = `${agent.id}-${outcomeName}`;
                          const { callDetails: callDetailsResult, isLoading: callDetailsLoading } = getCallDetailsForKey(expandedKey);
                          const callDetails = callDetailsResult || [];
                          
                          // Get outcome data from first call detail record if available  
                          const firstCallDetail = callDetails.length > 0 ? callDetails[0] : null;
                          const categoryStyle = getCategoryStyle(outcomeName, firstCallDetail, agentProjectId);
                          const isLoadingDetails = callDetailsLoading;
                          
                          console.log(`✅ Cache system data: ${callDetails.length} records for "${outcomeName}", loading: ${isLoadingDetails}`);
                          
                          return (
                            <div className={`bg-white dark:bg-gray-800 border-2 ${categoryStyle.borderColor} ${categoryStyle.bgColor} rounded-lg p-4`}>
                              <div className={`flex items-center justify-between mb-3 p-2 rounded-md ${categoryStyle.headerBg}`}>
                                <div className="flex items-center space-x-3">
                                  <h4 className={`text-md font-semibold ${categoryStyle.textColor}`}>
                                    Call-Details für "{outcomeName}"
                                  </h4>
                                </div>
                                
                                <div className="flex items-center space-x-4">
                                  {/* Duration Filter Dropdown */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={!hasCallDetails || callDetails.length <= 1}
                                        className={`text-xs ${
                                          !hasCallDetails || callDetails.length <= 1
                                            ? 'opacity-50 cursor-not-allowed' 
                                            : (durationFilters[expandedCallDetail] || []).length > 0 
                                              ? 'bg-blue-50 border-blue-200' 
                                              : ''
                                        }`}
                                      >
                                        <Filter className="w-3 h-3 mr-2" />
                                        {getDurationFilterLabel(expandedCallDetail)}
                                        <ChevronDown className="w-3 h-3 ml-2" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem 
                                        onClick={() => handleDurationFilterToggle(expandedCallDetail, '0-30')}
                                        className={(durationFilters[expandedCallDetail] || []).includes('0-30') ? 'bg-blue-50 font-medium' : ''}
                                      >
                                        {(durationFilters[expandedCallDetail] || []).includes('0-30') ? '✓ ' : ''}0-30 Sekunden
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDurationFilterToggle(expandedCallDetail, '30-60')}
                                        className={(durationFilters[expandedCallDetail] || []).includes('30-60') ? 'bg-blue-50 font-medium' : ''}
                                      >
                                        {(durationFilters[expandedCallDetail] || []).includes('30-60') ? '✓ ' : ''}30-60 Sekunden
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDurationFilterToggle(expandedCallDetail, '1-5')}
                                        className={(durationFilters[expandedCallDetail] || []).includes('1-5') ? 'bg-blue-50 font-medium' : ''}
                                      >
                                        {(durationFilters[expandedCallDetail] || []).includes('1-5') ? '✓ ' : ''}1-5 Minuten
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDurationFilterToggle(expandedCallDetail, '5-10')}
                                        className={(durationFilters[expandedCallDetail] || []).includes('5-10') ? 'bg-blue-50 font-medium' : ''}
                                      >
                                        {(durationFilters[expandedCallDetail] || []).includes('5-10') ? '✓ ' : ''}5-10 Minuten
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDurationFilterToggle(expandedCallDetail, '10+')}
                                        className={(durationFilters[expandedCallDetail] || []).includes('10+') ? 'bg-blue-50 font-medium' : ''}
                                      >
                                        {(durationFilters[expandedCallDetail] || []).includes('10+') ? '✓ ' : ''}Über 10 Minuten
                                      </DropdownMenuItem>
                                      {(durationFilters[expandedCallDetail] || []).length > 0 && (
                                        <>
                                          <hr className="my-1" />
                                          <DropdownMenuItem 
                                            onClick={() => clearDurationFilters(expandedCallDetail)}
                                            className="text-gray-500"
                                          >
                                            Alle Filter entfernen
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>

                                  {/* Time Filter Dropdown */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={!hasCallDetails}
                                        className={`text-xs ${
                                          !hasCallDetails 
                                            ? 'opacity-50 cursor-not-allowed' 
                                            : (timeFilters[expandedCallDetail]?.timeFrom || timeFilters[expandedCallDetail]?.timeTo) 
                                              ? 'bg-blue-50 border-blue-200' 
                                              : ''
                                        }`}
                                      >
                                        <Filter className="w-3 h-3 mr-2" />
                                        {getTimeFilterLabel(expandedCallDetail)}
                                        <ChevronDown className="w-3 h-3 ml-2" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64">
                                      <div className="p-2 space-y-2">
                                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                          Zeit-Filter
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Von:</label>
                                          <Input
                                            type="time"
                                            value={timeFilters[expandedCallDetail]?.timeFrom || ''}
                                            onChange={(e) => handleTimeFilterChange(expandedCallDetail, 'timeFrom', e.target.value)}
                                            className="w-20 text-xs h-8"
                                          />
                                          <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Bis:</label>
                                          <Input
                                            type="time"
                                            value={timeFilters[expandedCallDetail]?.timeTo || ''}
                                            onChange={(e) => handleTimeFilterChange(expandedCallDetail, 'timeTo', e.target.value)}
                                            className="w-20 text-xs h-8"
                                          />
                                        </div>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem 
                                          onClick={() => clearTimeFilters(expandedCallDetail)}
                                          className="text-gray-500"
                                        >
                                          Alle Filter entfernen
                                        </DropdownMenuItem>
                                      </div>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  
                                  {/* Detail Columns Toggle Button */}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowDetailColumns(!showDetailColumns)}
                                    className={`p-2 ${showDetailColumns 
                                      ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-400 text-orange-800 dark:text-orange-200' 
                                      : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-600 dark:text-gray-400'
                                    }`}
                                    title={showDetailColumns ? 'Detail-Spalten einklappen' : 'Detail-Spalten ausklappen'}
                                    data-testid="toggle-detail-columns"
                                  >
                                    <BarChart3 className="h-4 w-4" />
                                  </Button>
                                  
                                  {/* Close button */}
                                  <button
                                    onClick={() => {
                                      const newExpanded = new Set(expandedCallDetails);
                                      newExpanded.delete(expandedCallDetail);
                                      setExpandedCallDetails(newExpanded);
                                    }}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                    title="Details schließen"
                                  >
                                    <X className="h-4 w-4 text-red-500" />
                                  </button>
                                </div>
                              </div>
                          
                          <div className="overflow-auto max-h-80">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                                <tr>
                                  {[
                                    { key: 'anzahlAnrufe', label: 'Nr', align: 'left' },
                                    { key: 'datum', label: 'Datum', align: 'left' },
                                    { key: 'uhrzeit', label: 'Zeit', align: 'left' },
                                    { key: 'gespraechsdauer', label: 'Dauer', align: 'left' },
                                    // DETAIL COLUMNS (Orange) - direkt nach Dauer
                                    { key: 'wz_test', label: 'WZ (s)', align: 'center', isDetail: true },
                                    { key: 'gz_test', label: 'GZ (s)', align: 'center', isDetail: true },
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
                                  ].filter(column => (!column.isDetail || showDetailColumns) && (!column.isDebug || showDetailColumns)).map((column, idx) => {
                                    const sortState = sortConfig[expandedCallDetail];
                                    const isActive = sortState?.key === column.key;
                                    const canSort = column.key !== '';
                                    
                                    return (
                                      <th 
                                        key={idx}
                                        className={`py-2 font-medium text-gray-700 dark:text-gray-300 ${
                                          column.label === 'A' || column.label === 'T' || column.label === 'Notizen' ? 'px-1 w-10 text-center justify-center' : 'px-3'
                                        } ${
                                          column.align === 'center' ? 'text-center' : 'text-left'
                                        } ${
                                          canSort ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none' : ''
                                        } ${
                                          column.isDetail ? 'bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400' : ''
                                        }`}
                                        onClick={() => canSort && handleSort(expandedCallDetail, column.key)}
                                        data-testid={`sort-header-${column.key}`}
                                      >
                                        <div className="flex items-center space-x-1">
                                          <span>{column.label}</span>
                                          {canSort && (
                                            <div className="flex flex-col">
                                              <ChevronUp 
                                                className={`h-3 w-3 transition-colors ${
                                                  isActive && sortState.direction === 'asc' 
                                                    ? 'text-blue-600 dark:text-blue-400' 
                                                    : 'text-gray-400'
                                                }`} 
                                              />
                                              <ChevronDown 
                                                className={`h-3 w-3 -mt-1 transition-colors ${
                                                  isActive && sortState.direction === 'desc' 
                                                    ? 'text-blue-600 dark:text-blue-400' 
                                                    : 'text-gray-400'
                                                }`} 
                                              />
                                              </div>
                                            )}
                                          </div>
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {(() => {
                                  if (callDetailsLoading) {
                                    return (
                                      <tr>
                                        <td colSpan={showDetailColumns ? 15 : 9} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                                          <div className="flex items-center justify-center space-x-2">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                            <span>{t('emptyStates.loadingCallDetails')}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }
                                  
                                  // Apply filtering and sorting to callDetails using the unified function
                                  console.log(`🚀 CALL DETAILS DEBUG: Raw callDetails length: ${callDetails?.length || 0}`);
                                  const processedCallDetails = filterAndSortCallDetails(callDetails, expandedCallDetail);
                                  console.log(`🚀 CALL DETAILS DEBUG: After filtering, processedCallDetails length: ${processedCallDetails?.length || 0}`);
                                  const activeDurationFilters = durationFilters[expandedCallDetail] || [];
                                  const activeTimeFilter = timeFilters[expandedCallDetail] || {};
                                  console.log(`🚀 CALL DETAILS DEBUG: Active filters - duration: ${activeDurationFilters.length}, time: ${activeTimeFilter.timeFrom || 'none'} to ${activeTimeFilter.timeTo || 'none'}`);

                                  // Group call details by contacts_id, contacts_campaign_id, and transactions_fired_date
                                  const createGroupedCallDetails = (processedCallDetails: any[]) => {
                                    console.log(`🚀 GROUP PROCESSING DEBUG: Got ${processedCallDetails.length} processedCallDetails`);
                                    if (processedCallDetails.length === 0) {
                                      console.log(`⚠️ GROUP PROCESSING DEBUG: Empty processedCallDetails array, returning empty groups`);
                                      return [];
                                    }
                                    
                                    const groups = new Map<string, {
                                      key: string;
                                      contacts_id: string;
                                      contacts_campaign_id: string; 
                                      transactions_fired_date: string;
                                      calls: any[];
                                      totalDuration: number;
                                      firstCallTime: Date | null;
                                      latestCallTime: Date | null;
                                      latestCallDuration: number;
                                      hasSuccessfulCall: boolean;
                                    }>();
                                    
                                    processedCallDetails.forEach(call => {
                                      console.log(`🔍 CALL STRUCTURE DEBUG:`, { 
                                        id: call.id, 
                                        callStart: call.callStart, 
                                        callStartType: typeof call.callStart,
                                        uhrzeit: call.uhrzeit,
                                        datum: call.datum 
                                      });
                                      
                                      // Use backend groupId if available, otherwise create composite key
                                      const groupKey = call.group_id || 
                                        `${call.contacts_id || ''}|${call.contacts_campaign_id || ''}|${call.transactions_fired_date || call.datum || ''}`;
                                      
                                      if (!groups.has(groupKey)) {
                                        groups.set(groupKey, {
                                          key: groupKey,
                                          contacts_id: call.contacts_id || '',
                                          contacts_campaign_id: call.contacts_campaign_id || '',
                                          transactions_fired_date: call.transactions_fired_date || call.datum || '',
                                          calls: [],
                                          totalDuration: 0,
                                          firstCallTime: call.callStart ? new Date(call.callStart) : null,
                                          latestCallTime: call.callStart ? new Date(call.callStart) : null,
                                          latestCallDuration: call.durationInSeconds || call.duration || 0,
                                          hasSuccessfulCall: false
                                        });
                                      }
                                      
                                      const group = groups.get(groupKey)!;
                                      group.calls.push(call);
                                      group.totalDuration += call.durationInSeconds || 0;
                                      
                                      // Check if this call is successful
                                      if (call.outcomeCategory === 'positive') {
                                        group.hasSuccessfulCall = true;
                                      }
                                      
                                      // CRITICAL FIX: Extract time from datum + uhrzeit fields
                                      let callTime = null;
                                      console.log(`🔍 CALL STRUCTURE DEBUG:`, {
                                        id: call.id,
                                        callStartType: typeof call.callStart,
                                        uhrzeit: call.uhrzeit,
                                        datum: call.datum
                                      });
                                      
                                      // Try callStart first (if available)
                                      if (call.callStart) {
                                        callTime = new Date(call.callStart);
                                        console.log(`🔧 DIRECT FIX: Call ${call.id} - callStart="${call.callStart}" → parsed="${callTime.toISOString()}"`);
                                      }
                                      // Fallback: construct from datum + uhrzeit 
                                      else if (call.datum && call.uhrzeit) {
                                        try {
                                          // Convert "15.09.25" to "2025-09-15" and combine with time
                                          const dateParts = call.datum.split('.');
                                          if (dateParts.length === 3) {
                                            const day = dateParts[0];
                                            const month = dateParts[1]; 
                                            const year = '20' + dateParts[2]; // "25" → "2025"
                                            const dateString = `${year}-${month}-${day} ${call.uhrzeit}:00`;
                                            callTime = new Date(dateString);
                                            console.log(`🔧 DATUM+UHRZEIT FIX: Call ${call.id} - datum="${call.datum}" uhrzeit="${call.uhrzeit}" → combined="${dateString}" → parsed="${callTime.toISOString()}"`);
                                          }
                                        } catch (e) {
                                          console.log(`❌ DATUM+UHRZEIT ERROR: Call ${call.id} - datum="${call.datum}" uhrzeit="${call.uhrzeit}" error:`, e);
                                        }
                                      }
                                      
                                      if (callTime && !isNaN(callTime.getTime())) {
                                        // Update latest time (for header display)
                                        if (group.latestCallTime === null || callTime > group.latestCallTime) {
                                          console.log(`✅ TIME FIXED: Updated latestCallTime for group ${groupKey} to "${callTime.toISOString()}" (${call.uhrzeit})`);
                                          group.latestCallTime = callTime;
                                          // Also update the duration of the latest call (consistent fallback pattern)
                                          group.latestCallDuration = call.durationInSeconds || call.duration || 0;
                                          console.log(`✅ DURATION UPDATED: Latest call duration for group ${groupKey} is ${group.latestCallDuration} seconds`);
                                        }
                                        // Update earliest time
                                        if (group.firstCallTime === null || callTime < group.firstCallTime) {
                                          group.firstCallTime = callTime;
                                        }
                                      } else {
                                        console.log(`❌ TIME EXTRACTION FAILED: Call ${call.id} - no valid time found from callStart, datum, or uhrzeit`);
                                      }
                                    });
                                    
                                    // Convert to array and sort by first call time (newest first)
                                    return Array.from(groups.values()).sort((a, b) => {
                                      if (!a.firstCallTime && !b.firstCallTime) return 0;
                                      if (!a.firstCallTime) return 1;
                                      if (!b.firstCallTime) return -1;
                                      return b.firstCallTime.getTime() - a.firstCallTime.getTime();
                                    });
                                  };
                                  
                                  const groupedCallDetails = createGroupedCallDetails(processedCallDetails);

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
                                  
                                  if (callDetails.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={showDetailColumns ? 15 : 9} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                                          Keine Datensätze für "{outcomeName}" vorhanden
                                        </td>
                                      </tr>
                                    );
                                  }
                                  
                                  if (processedCallDetails.length === 0 && (activeDurationFilters.length > 0 || activeTimeFilter.timeFrom || activeTimeFilter.timeTo)) {
                                    return (
                                      <tr>
                                        <td colSpan={showDetailColumns ? 15 : 9} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                                          Keine Anrufe für die gewählten Filter gefunden
                                        </td>
                                      </tr>
                                    );
                                  }
                                  
                                  // Render grouped call details
                                  return groupedCallDetails.flatMap(group => {
                                    const isGroupExpanded = expandedGroupIds.has(group.key);
                                    const groupRows = [];
                                    
                                    // If group has only one call, render it directly without group header
                                    if (group.calls.length === 1) {
                                      const detail = group.calls[0];
                                      const isLongCall = detail.durationInSeconds > 600;
                                      const rowBgClass = isLongCall 
                                        ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30" 
                                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50";
                                      
                                      return [(
                                        <tr key={`single-${group.key}-${detail.id}`} className={rowBgClass} data-testid={`row-call-${detail.id}`}>
                                          <td className="px-3 py-2 text-sm">{detail.anzahlAnrufe || 1}</td>
                                          <td className="px-3 py-2 text-sm">{detail.datum}</td>
                                          <td className="px-3 py-2 text-sm font-mono">{formatCallTime(detail, t('common.locale'))}</td>
                                          <td className="px-3 py-2 text-sm font-mono">
                                            {Math.floor((detail.durationInSeconds || 0) / 60)}:{((detail.durationInSeconds || 0) % 60).toString().padStart(2, '0')}
                                          </td>
                                          {/* DETAIL COLUMNS (Orange) */}
                                          {showDetailColumns && (
                                            <>
                                              <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.wz_test || '-'}</td>
                                              <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.gz_test || '-'}</td>
                                              <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.nbz_test || '-'}</td>
                                              <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.vbz_test || '-'}</td>
                                              <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.erfolg_test || '-'}</td>
                                              <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.az_test || '-'}</td>
                                              {/* DEBUG COLUMNS (Yellow) */}
                                              <td className="px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20">{detail.contacts_id || '-'}</td>
                                              <td className="px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20">{detail.contacts_campaign_id || '-'}</td>
                                              <td className="px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20">{detail.group_id || '-'}</td>
                                            </>
                                          )}
                                          <td className="px-3 py-2 text-sm">
                                            {detail.id && (
                                              <a 
                                                href={`https://app.dialfire.com/${detail.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 dark:text-blue-400 hover:underline"
                                                title="Dialfire öffnen"
                                                data-testid={`link-dialfire-${detail.id}`}
                                              >
                                                {detail.id.slice(0, 8)}...
                                              </a>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-sm">{detail.firmenname || '-'}</td>
                                          <td className="px-3 py-2 text-sm">{detail.ansprechpartner || '-'}</td>
                                          {/* Audio Column */}
                                          <td className="px-1 py-2 text-center w-10">
                                            {detail.recordingUrl ? (
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                                                    <AudioLines className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent 
                                                  className="w-80"
                                                  onClick={(e) => e.stopPropagation()}
                                                  side="top"
                                                >
                                                  <AudioPlayerTooltip recordingUrl={detail.recordingUrl} callDuration={detail.durationInSeconds || detail.duration} />
                                                </PopoverContent>
                                              </Popover>
                                            ) : (
                                              <AudioLines className="h-4 w-4 text-gray-300 mx-auto" />
                                            )}
                                          </td>
                                          {/* Transcription Column */}
                                          <td className="px-1 py-2 text-center w-10">
                                            {detail.recordingUrl ? (
                                              <TranscriptionButton 
                                                recordingUrl={detail.recordingUrl}
                                                callId={detail.id}
                                                callTranscriptionStates={callTranscriptionStates}
                                                setCallTranscriptionStates={setCallTranscriptionStates}
                                              />
                                            ) : (
                                              <MessageCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                            )}
                                          </td>
                                          {/* Notizen Column */}
                                          <td className="px-1 py-2 text-center w-10 justify-center">
                                            <NotizButton 
                                              notizText={detail.contacts_notiz}
                                              callId={detail.id}
                                            />
                                          </td>
                                        </tr>
                                      )];
                                    }
                                    
                                    // Group Header Row
                                    groupRows.push(
                                      <tr key={`group-${group.key}`} className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200" data-testid={`row-group-header-${group.key}`}>
                                        <td className="px-3 py-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleGroupExpansion(group.key);
                                            }}
                                            className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 font-semibold hover:text-blue-900 dark:hover:text-blue-100"
                                            data-testid={`button-toggle-group-${group.key}`}
                                          >
                                            {isGroupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            <span className="bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded-full text-xs font-bold">
                                              ×{group.calls.length}
                                            </span>
                                          </button>
                                        </td>
                                        <td className="px-3 py-2 font-semibold">{group.transactions_fired_date}</td>
                                        <td className="px-3 py-2">
                                          {(() => {
                                            console.log(`🚀 TIME DISPLAY DEBUG: Group ${group.key}, latestCallTime=${group.latestCallTime?.toISOString() || 'null'}`);
                                            return group.latestCallTime ? group.latestCallTime.toLocaleTimeString(t('common.locale'), {hour: '2-digit', minute: '2-digit'}) : '-';
                                          })()}
                                        </td>
                                        <td className="px-3 py-2 font-mono">
                                          {Math.floor(group.latestCallDuration / 60).toString().padStart(2, '0')}:{(group.latestCallDuration % 60).toString().padStart(2, '0')}
                                        </td>
                                        {/* DETAIL COLUMNS (Orange) - Summary for group */}
                                        {showDetailColumns && (
                                          <>
                                            <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">-</td>
                                            <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">{group.totalDuration}</td>
                                            <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">-</td>
                                            <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">-</td>
                                            <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                              {group.hasSuccessfulCall ? '1' : '0'}
                                            </td>
                                            <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">{group.totalDuration}</td>
                                          </>
                                        )}
                                        {/* DEBUG COLUMNS for grouping analysis - Group Info */}
                                        {showDetailColumns && (
                                          <>
                                            <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 font-semibold">{group.contacts_id}</td>
                                            <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 font-semibold">{group.contacts_campaign_id}</td>
                                            <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-r-2 border-yellow-400 font-semibold">{group.key}</td>
                                          </>
                                        )}
                                        <td className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">
                                          {(() => {
                                            // Find the latest call (matching the latestCallTime)
                                            const latestCall = group.calls.find(call => {
                                              if (!group.latestCallTime) return false;
                                              const callTime = call.callStart ? new Date(call.callStart) : 
                                                (call.datum && call.uhrzeit) ? (() => {
                                                  const [day, month, year] = call.datum.split('.');
                                                  const fullYear = year.length === 2 ? `20${year}` : year;
                                                  const [hours, minutes] = call.uhrzeit.split(':');
                                                  return new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`);
                                                })() : null;
                                              return callTime && Math.abs(callTime.getTime() - group.latestCallTime.getTime()) < 1000; // 1 second tolerance
                                            });
                                            return latestCall?.id || group.calls[0]?.id || '-';
                                          })()}
                                        </td>
                                        <td className="px-3 py-2 font-semibold">{group.calls[0]?.firmenname || '-'}</td>
                                        <td className="px-3 py-2 font-semibold">{group.calls[0]?.ansprechpartner || '-'}</td>
                                        <td className="px-1 py-2 text-center">
                                          {group.calls.some(c => c.audio) ? <AudioLines className="h-4 w-4 text-blue-600 mx-auto" /> : <AudioLines className="h-4 w-4 text-gray-300 mx-auto" />}
                                        </td>
                                        <td className="px-1 py-2 text-center">
                                          {group.calls.some(c => c.recordingUrl) ? <MessageCircle className="h-4 w-4 text-blue-600 mx-auto" /> : <MessageCircle className="h-4 w-4 text-gray-300 mx-auto" />}
                                        </td>
                                        <td className="px-1 py-2 text-center">
                                          {group.calls.some(c => c.contacts_notiz) ? <FileText className="h-4 w-4 text-blue-600 mx-auto" /> : <FileText className="h-4 w-4 text-gray-300 mx-auto" />}
                                        </td>
                                      </tr>
                                    );
                                    
                                    // Individual Call Rows (when group is expanded)
                                    if (isGroupExpanded) {
                                      group.calls.forEach((detail, index) => {
                                        const isLongCall = detail.durationInSeconds > 600;
                                        const rowBgClass = isLongCall 
                                          ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30" 
                                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50";
                                        
                                        groupRows.push(
                                          <tr key={`call-${detail.id}-${index}`} className={`${rowBgClass} border-l-4 border-blue-300`} data-testid={`row-call-${detail.id}`}>
                                            <td className="px-3 py-2 font-mono pl-8">{detail.anzahlAnrufe}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">{detail.datum}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">{formatCallTime(detail, t('common.locale'))}</td>
                                            <td className="px-3 py-2 font-mono">{detail.gespraechsdauer}</td>
                                            {/* DETAIL COLUMNS (Orange) - direkt nach Dauer */}
                                            {showDetailColumns && (
                                              <>
                                                <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                  {detail.waitTimeSeconds ? Math.round(detail.waitTimeSeconds) : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                  {detail.duration ? Math.round(detail.duration) : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                  {detail.wrapupTimeSeconds ? Math.round(detail.wrapupTimeSeconds) : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                  {detail.editTimeSeconds ? Math.round(detail.editTimeSeconds) : '-'}
                                                </td>
                                                <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                  {detail.outcomeCategory === 'positive' ? '1' : '0'}
                                                </td>
                                                <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                  {detail.duration ? Math.round(detail.duration) : '-'}
                                                </td>
                                              </>
                                            )}
                                            {/* DEBUG COLUMNS for grouping analysis */}
                                            {showDetailColumns && (
                                              <>
                                                <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400">{detail.contacts_id || '-'}</td>
                                                <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400">{detail.contacts_campaign_id || '-'}</td>
                                                <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-r-2 border-yellow-400">{detail.group_id || '-'}</td>
                                              </>
                                            )}
                                            <td className="px-3 py-2 font-mono text-sm">{detail.id}</td>
                                            <td className="px-3 py-2 font-mono whitespace-nowrap text-sm">{detail.firmenname}</td>
                                            <td className="px-3 py-2 font-mono whitespace-nowrap text-sm">{detail.ansprechpartner}</td>
                                            <td className="px-1 py-2 text-center w-10 justify-center">
                                              {detail.audio ? (
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <AudioLines 
                                                      className="h-4 w-4 text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-800 dark:hover:text-blue-200 transition-colors mx-auto" 
                                                    />
                                                  </PopoverTrigger>
                                                  <PopoverContent 
                                                    className="p-4 w-80" 
                                                    onClick={(e) => e.stopPropagation()}
                                                    side="top"
                                                  >
                                                    <AudioPlayerTooltip recordingUrl={detail.recordingUrl} callDuration={detail.durationInSeconds} />
                                                  </PopoverContent>
                                                </Popover>
                                              ) : (
                                                <AudioLines className="h-4 w-4 text-gray-300" />
                                              )}
                                            </td>
                                            <td className="px-1 py-2 text-center w-10 justify-center">
                                              {detail.recordingUrl ? (
                                                <TranscriptionButton 
                                                  recordingUrl={detail.recordingUrl}
                                                  callId={detail.id}
                                                  callTranscriptionStates={callTranscriptionStates}
                                                  setCallTranscriptionStates={setCallTranscriptionStates}
                                                />
                                              ) : (
                                                <MessageCircle className="h-4 w-4 text-gray-300" />
                                              )}
                                            </td>
                                            {/* Notizen Column */}
                                            <td className="px-1 py-2 text-center w-10 justify-center">
                                              <NotizButton 
                                                notizText={detail.contacts_notiz}
                                                callId={detail.id}
                                              />
                                            </td>
                                          </tr>
                                        );
                                      });
                                    }
                                    
                                    return groupRows;
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}

                  {/* Projects Row - for project-based call details */}
                  <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-200">
                    <td colSpan={12} className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 hover:bg-transparent text-sm font-medium"
                            onClick={() => {
                              toggleProjectExpansion(agent.id);
                            }}
                            data-testid={`button-projects-${agent.id}`}
                          >
                            {expandedProjects.has(agent.id) ? (
                              <Minus className="w-3 h-3 text-blue-600" />
                            ) : (
                              <Plus className="w-3 h-3 text-blue-600" />
                            )}
                          </Button>
                          <BarChart3 className="w-4 h-4 text-blue-600" />
                          <h4 className="font-semibold text-blue-800 dark:text-blue-200 cursor-pointer"
                              onClick={() => {
                                toggleProjectExpansion(agent.id);
                              }}>
                            Projekte
                          </h4>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Project Details - shown when expandedProjects contains agent.id */}
                  {expandedProjects.has(agent.id) && (
                    <tr className="bg-blue-25 dark:bg-blue-900/10">
                      <td colSpan={12} className="px-4 py-4">
                        <div className="bg-white dark:bg-gray-800 border-2 border-blue-200 rounded-lg p-4">
                          {(() => {
                            // Group agent stats by project
                            const projectGroups = agentStats.reduce((groups, stat) => {
                              const projectName = getProjectName(stat.projectId);
                              if (!groups[projectName]) {
                                groups[projectName] = [];
                              }
                              groups[projectName].push(stat);
                              return groups;
                            }, {} as Record<string, typeof agentStats>);

                            return (
                              <div className="space-y-6">
                                {Object.entries(projectGroups).map(([projectName, projectStats]) => {
                                  // Calculate project totals
                                  const projectTotals = projectStats.reduce((acc, stat) => {
                                    Object.entries(stat.outcomes || {}).forEach(([key, value]) => {
                                      acc[key] = (acc[key] || 0) + value;
                                    });
                                    return acc;
                                  }, {} as Record<string, number>);

                                  const totalCalls = Object.values(projectTotals).reduce((sum, count) => sum + count, 0);

                                  const projectKey = `${agent.id}-${projectName}`;
                                  const isProjectExpanded = expandedIndividualProjects.has(projectKey);
                                  
                                  // Use the same calculation as for total agent stats
                                  const projectStatistics = projectStats.reduce((acc, stat) => {
                                    // Anzahl
                                    acc.anzahl += stat.anzahl || 0;
                                    // Abgeschlossen (sum of all outcomes)  
                                    acc.abgeschlossen += stat.abgeschlossen || 0;
                                    // Erfolgreich
                                    acc.erfolgreich += stat.erfolgreich || 0;
                                    // Times - already calculated in hours in the statistics
                                    acc.wartezeit += stat.wartezeit || 0;
                                    acc.gespraechszeit += stat.gespraechszeit || 0;
                                    acc.nachbearbeitungszeit += stat.nachbearbeitungszeit || 0;
                                    acc.vorbereitungszeit += stat.vorbereitungszeit || 0;
                                    acc.arbeitszeit += stat.arbeitszeit || 0;
                                    acc.erfolgProStunde += stat.erfolgProStunde || 0;
                                    return acc;
                                  }, {
                                    anzahl: 0,
                                    abgeschlossen: 0,
                                    erfolgreich: 0,
                                    wartezeit: 0,
                                    gespraechszeit: 0,
                                    nachbearbeitungszeit: 0,
                                    vorbereitungszeit: 0,
                                    arbeitszeit: 0,
                                    erfolgProStunde: 0
                                  });
                                  
                                  // Average the Erfolg/h if there are multiple stats
                                  if (projectStats.length > 0) {
                                    projectStatistics.erfolgProStunde = projectStatistics.erfolgProStunde / projectStats.length;
                                  }
                                  
                                  return (
                                    <div key={projectName} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                      <div className="mb-3">
                                        <div className="cursor-pointer hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                            onClick={() => toggleIndividualProjectExpansion(agent.id, projectName)}>
                                          <div className="flex items-center">
                                            <button
                                              className="inline-flex items-center justify-center rounded-md p-0.5 mr-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleIndividualProjectExpansion(agent.id, projectName);
                                              }}
                                            >
                                              {isProjectExpanded ? (
                                                <Minus className="h-3.5 w-3.5 text-blue-600" />
                                              ) : (
                                                <Plus className="h-3.5 w-3.5 text-blue-600" />
                                              )}
                                            </button>
                                            <span className="mr-2">📋</span>
                                            <h5 className="font-semibold text-gray-800 dark:text-gray-200">{projectName}</h5>
                                          </div>
                                          {/* Project Statistics - unter dem Projektnamen */}
                                          <div className="mt-2 ml-8 flex flex-wrap items-center gap-x-3 text-xs text-gray-600 dark:text-gray-400">
                                            <span>Anzahl: <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.anzahl}</span></span>
                                            <span>abgeschlossen: <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.abgeschlossen}</span></span>
                                            <span>erfolgreich: <span className="font-bold text-green-600">{projectStatistics.erfolgreich}</span></span>
                                            <span>WZ (h): <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.wartezeit.toFixed(2)}</span></span>
                                            <span>GZ (h): <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.gespraechszeit.toFixed(2)}</span></span>
                                            <span>NBZ (h): <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.nachbearbeitungszeit.toFixed(2)}</span></span>
                                            <span>VBZ (h): <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.vorbereitungszeit.toFixed(2)}</span></span>
                                            <span>Erfolg/h: <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.erfolgProStunde.toFixed(2)}</span></span>
                                            <span>AZ (h): <span className="font-bold text-gray-800 dark:text-gray-200">{projectStatistics.arbeitszeit.toFixed(2)}</span></span>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {isProjectExpanded && totalCalls > 0 ? (
                                        <div className="grid grid-cols-3 gap-6 divide-x divide-border">
                                          {(() => {
                                            const negativeOutcomes = callOutcomes.filter(co => co.category === 'negative');
                                            const positiveOutcomes = callOutcomes.filter(co => co.category === 'positive');
                                            const offenOutcomes = callOutcomes.filter(co => co.category === 'offen');

                                            // 🎯 FIXED: Use dynamic classification instead of static CallOutcome matching
                                            let negativeTotal = 0, positiveTotal = 0, offenTotal = 0;
                                            Object.entries(projectTotals).forEach(([outcomeName, count]) => {
                                              const category = classifyOutcome(outcomeName, 'all');
                                              console.log(`📊 PROJECT CLASSIFY: "${outcomeName}" (${count}) -> ${category}`);
                                              
                                              if (category === 'negative') {
                                                negativeTotal += count;
                                              } else if (category === 'positive') {
                                                positiveTotal += count;
                                              } else {
                                                offenTotal += count;
                                              }
                                            });

                                            if (statisticsLoading || categoriesLoading) {
                                              return (
                                                <div className="col-span-3 flex items-center justify-center h-32">
                                                  <div className="text-center">
                                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-800 dark:border-gray-200 mx-auto mb-2"></div>
                                                    <p className="text-sm text-gray-800 dark:text-gray-200">Lade Anrufinformationen...</p>
                                                  </div>
                                                </div>
                                              );
                                            }

                                            return (
                                              <>
                                                <div>
                                                  <h6 className="font-medium mb-2 text-red-600 flex items-center text-sm">
                                                    <ThumbsDown className="w-3 h-3 mr-1" />
                                                    Negativ ({negativeTotal})
                                                  </h6>
                                                  <div className="space-y-1">
                                                    {negativeOutcomes.map(outcome => (
                                                      <div key={outcome.id} className="flex items-center text-xs">
                                                        <div className="w-6 flex justify-center mr-1">
                                                          {(projectTotals[outcome.name] || 0) > 0 ? (
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleProjectCallDetailsExpansion(projectStats[0]?.projectId || '', outcome.name);
                                                              }}
                                                              className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                              title={`Details für ${outcome.name} ${expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                                            >
                                                              {expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? (
                                                                <Minus className="h-3.5 w-3.5 text-gray-500" />
                                                              ) : (
                                                                <Plus className="h-3.5 w-3.5 text-gray-500" />
                                                              )}
                                                            </button>
                                                          ) : null}
                                                        </div>
                                                        {(projectTotals[outcome.name] || 0) > 0 ? (
                                                          <button 
                                                            className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors rounded-md px-0.5 text-left flex-1"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleProjectCallDetailsExpansion(projectStats[0]?.projectId || '', outcome.name);
                                                            }}
                                                            title={`Details für ${outcome.name} ${expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                                          >
                                                            {outcome.name}
                                                          </button>
                                                        ) : (
                                                          <span className="text-gray-400 px-0.5 text-left flex-1">
                                                            {outcome.name}
                                                          </span>
                                                        )}
                                                        <span className="font-mono ml-auto">{projectTotals[outcome.name] || 0}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                                
                                                <div className="pl-6">
                                                  <h6 className="font-medium mb-2 text-green-600 flex items-center text-sm">
                                                    <ThumbsUp className="w-3 h-3 mr-1" />
                                                    Positiv ({positiveTotal})
                                                  </h6>
                                                  <div className="space-y-1">
                                                    {positiveOutcomes.map(outcome => (
                                                      <div key={outcome.id} className="flex items-center text-xs">
                                                        <div className="w-6 flex justify-center mr-1">
                                                          {(projectTotals[outcome.name] || 0) > 0 ? (
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleProjectCallDetailsExpansion(projectStats[0]?.projectId || '', outcome.name);
                                                              }}
                                                              className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                              title={`Details für ${outcome.name} ${expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                                            >
                                                              {expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? (
                                                                <Minus className="h-3.5 w-3.5 text-gray-500" />
                                                              ) : (
                                                                <Plus className="h-3.5 w-3.5 text-gray-500" />
                                                              )}
                                                            </button>
                                                          ) : null}
                                                        </div>
                                                        {(projectTotals[outcome.name] || 0) > 0 ? (
                                                          <button 
                                                            className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors rounded-md px-0.5 text-left flex-1"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleProjectCallDetailsExpansion(projectStats[0]?.projectId || '', outcome.name);
                                                            }}
                                                            title={`Details für ${outcome.name} ${expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                                          >
                                                            {outcome.name}
                                                          </button>
                                                        ) : (
                                                          <span className="text-gray-400 px-0.5 text-left flex-1">
                                                            {outcome.name}
                                                          </span>
                                                        )}
                                                        <span className="font-mono ml-auto">{projectTotals[outcome.name] || 0}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                                
                                                <div className="pl-6">
                                                  <h6 className="font-medium mb-2 text-blue-600 flex items-center text-sm">
                                                    <AlertCircle className="w-3 h-3 mr-1" />
                                                    Offen ({offenTotal})
                                                  </h6>
                                                  <div className="space-y-1">
                                                    {offenOutcomes.map(outcome => (
                                                      <div key={outcome.id} className="flex items-center text-xs">
                                                        <div className="w-6 flex justify-center mr-1">
                                                          {(projectTotals[outcome.name] || 0) > 0 ? (
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleProjectCallDetailsExpansion(projectStats[0]?.projectId || '', outcome.name);
                                                              }}
                                                              className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                              title={`Details für ${outcome.name} ${expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                                            >
                                                              {expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? (
                                                                <Minus className="h-3.5 w-3.5 text-gray-500" />
                                                              ) : (
                                                                <Plus className="h-3.5 w-3.5 text-gray-500" />
                                                              )}
                                                            </button>
                                                          ) : null}
                                                        </div>
                                                        {(projectTotals[outcome.name] || 0) > 0 ? (
                                                          <button 
                                                            className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-300 transition-colors rounded-md px-0.5 text-left flex-1"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleProjectCallDetailsExpansion(projectStats[0]?.projectId || '', outcome.name);
                                                            }}
                                                            title={`Details für ${outcome.name} ${expandedProjectCallDetails.has(`${projectStats[0]?.projectId || ''}-${outcome.name}`) ? 'ausblenden' : 'anzeigen'}`}
                                                          >
                                                            {outcome.name}
                                                          </button>
                                                        ) : (
                                                          <span className="text-gray-400 px-0.5 text-left flex-1">
                                                            {outcome.name}
                                                          </span>
                                                        )}
                                                        <span className="font-mono ml-auto">{projectTotals[outcome.name] || 0}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      ) : isProjectExpanded ? (
                                        <p className="text-gray-500 text-sm">Keine Anrufe für dieses Projekt.</p>
                                      ) : null}

                                      {/* Project-specific call details - only show when project is expanded */}
                                      {isProjectExpanded && Array.from(expandedProjectCallDetails)
                                        .filter(key => key.startsWith((projectStats[0]?.projectId || '') + '-'))
                                        .map(expandedProjectCallDetail => {
                                          const outcomeName = expandedProjectCallDetail.substring((projectStats[0]?.projectId || '').length + 1);
                                          const expandedKey = `${agent.id}-${outcomeName}`;
                                          const { callDetails: callDetailsResult, isLoading: callDetailsLoading } = getCallDetailsForKey(expandedKey);
                                          const callDetails = callDetailsResult || [];
                                          // Get outcome data from first call detail record if available
                                          const firstCallDetail = callDetails.length > 0 ? callDetails[0] : null;
                                          const projectId = projectStats[0]?.projectId || '';
                                          const categoryStyle = getCategoryStyle(outcomeName, firstCallDetail, projectId);
                                          const projectCallDetailKey = `project-${projectId || 'unknown'}-${outcomeName}`;
                                          const isLoadingDetails = callDetailsLoading;

                                          return (
                                            <div key={expandedProjectCallDetail} className={`mt-4 bg-white dark:bg-gray-800 border-2 ${categoryStyle.borderColor} ${categoryStyle.bgColor} rounded-lg p-4`}>

                                              {isLoadingDetails ? (
                                                <div className="flex items-center justify-center py-8">
                                                  <div className="text-center">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                                    <p className="text-sm text-gray-600">{t('emptyStates.loadingCallDetails')}</p>
                                                  </div>
                                                </div>
                                              ) : callDetails.length === 0 ? (
                                                <div className="text-center py-8">
                                                  <p className="text-gray-500">Keine Call-Details verfügbar für {outcomeName}</p>
                                                </div>
                                              ) : (
                                                <div className="overflow-x-auto">
                                                  <div className={`flex items-center justify-between mb-3 p-2 rounded-md ${categoryStyle.headerBg}`}>
                                                    <div className="flex items-center space-x-3">
                                                      <h4 className={`text-md font-semibold ${categoryStyle.textColor}`}>
                                                        Call-Details für "{outcomeName}"
                                                      </h4>
                                                    </div>
                                                    
                                                    <div className="flex items-center space-x-4">
                                                      {/* Detail Columns Toggle Button */}
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setShowDetailColumns(!showDetailColumns)}
                                                        className={`p-2 ${showDetailColumns 
                                                          ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-400 text-orange-800 dark:text-orange-200' 
                                                          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-600 dark:text-gray-400'
                                                        }`}
                                                        title={showDetailColumns ? 'Detail-Spalten einklappen' : 'Detail-Spalten ausklappen'}
                                                        data-testid="toggle-detail-columns"
                                                      >
                                                        <BarChart3 className="h-4 w-4" />
                                                      </Button>
                                                      
                                                      {/* Duration Filter Dropdown */}
                                                      <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                          <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={`text-xs ${
                                                              (durationFilters[projectCallDetailKey] || []).length > 0 
                                                                ? 'bg-blue-50 border-blue-200' 
                                                                : ''
                                                            }`}
                                                          >
                                                            <Filter className="w-3 h-3 mr-2" />
                                                            {getDurationFilterLabel(projectCallDetailKey)}
                                                            <ChevronDown className="w-3 h-3 ml-2" />
                                                          </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                          <DropdownMenuItem 
                                                            onClick={() => handleDurationFilterToggle(projectCallDetailKey, '0-30')}
                                                            className={(durationFilters[projectCallDetailKey] || []).includes('0-30') ? 'bg-blue-50 font-medium' : ''}
                                                          >
                                                            {(durationFilters[projectCallDetailKey] || []).includes('0-30') ? '✓ ' : ''}0-30 Sekunden
                                                          </DropdownMenuItem>
                                                          <DropdownMenuItem 
                                                            onClick={() => handleDurationFilterToggle(projectCallDetailKey, '30-60')}
                                                            className={(durationFilters[projectCallDetailKey] || []).includes('30-60') ? 'bg-blue-50 font-medium' : ''}
                                                          >
                                                            {(durationFilters[projectCallDetailKey] || []).includes('30-60') ? '✓ ' : ''}30-60 Sekunden
                                                          </DropdownMenuItem>
                                                          <DropdownMenuItem 
                                                            onClick={() => handleDurationFilterToggle(projectCallDetailKey, '1-5')}
                                                            className={(durationFilters[projectCallDetailKey] || []).includes('1-5') ? 'bg-blue-50 font-medium' : ''}
                                                          >
                                                            {(durationFilters[projectCallDetailKey] || []).includes('1-5') ? '✓ ' : ''}1-5 Minuten
                                                          </DropdownMenuItem>
                                                          <DropdownMenuItem 
                                                            onClick={() => handleDurationFilterToggle(projectCallDetailKey, '5-10')}
                                                            className={(durationFilters[projectCallDetailKey] || []).includes('5-10') ? 'bg-blue-50 font-medium' : ''}
                                                          >
                                                            {(durationFilters[projectCallDetailKey] || []).includes('5-10') ? '✓ ' : ''}5-10 Minuten
                                                          </DropdownMenuItem>
                                                          <DropdownMenuItem 
                                                            onClick={() => handleDurationFilterToggle(projectCallDetailKey, '10+')}
                                                            className={(durationFilters[projectCallDetailKey] || []).includes('10+') ? 'bg-blue-50 font-medium' : ''}
                                                          >
                                                            {(durationFilters[projectCallDetailKey] || []).includes('10+') ? '✓ ' : ''}10+ Minuten
                                                          </DropdownMenuItem>
                                                          <DropdownMenuSeparator />
                                                          <DropdownMenuItem 
                                                            onClick={() => clearDurationFilters(projectCallDetailKey)}
                                                            className="text-gray-500"
                                                          >
                                                            Alle Filter entfernen
                                                          </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                      </DropdownMenu>

                                                      {/* Time Filter Dropdown */}
                                                      <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                          <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={`text-xs ${
                                                              timeFilters[projectCallDetailKey]?.timeFrom || timeFilters[projectCallDetailKey]?.timeTo
                                                                ? 'bg-blue-50 border-blue-200' 
                                                                : ''
                                                            }`}
                                                          >
                                                            <Clock className="w-3 h-3 mr-2" />
                                                            {getTimeFilterLabel(projectCallDetailKey)}
                                                            <ChevronDown className="w-3 h-3 ml-2" />
                                                          </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-64">
                                                          <div className="p-2">
                                                            <div className="flex items-center space-x-2 mb-2">
                                                              <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Von:</label>
                                                              <Input
                                                                type="time"
                                                                value={timeFilters[projectCallDetailKey]?.timeFrom || ''}
                                                                onChange={(e) => handleTimeFilterChange(projectCallDetailKey, 'timeFrom', e.target.value)}
                                                                className="w-20 text-xs h-8"
                                                              />
                                                              <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Bis:</label>
                                                              <Input
                                                                type="time"
                                                                value={timeFilters[projectCallDetailKey]?.timeTo || ''}
                                                                onChange={(e) => handleTimeFilterChange(projectCallDetailKey, 'timeTo', e.target.value)}
                                                                className="w-20 text-xs h-8"
                                                              />
                                                            </div>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem 
                                                              onClick={() => clearTimeFilters(projectCallDetailKey)}
                                                              className="text-gray-500"
                                                            >
                                                              Alle Filter entfernen
                                                            </DropdownMenuItem>
                                                          </div>
                                                        </DropdownMenuContent>
                                                      </DropdownMenu>
                                                      
                                                      {/* Close button */}
                                                      <button
                                                        onClick={() => {
                                                          const newExpanded = new Set(expandedProjectCallDetails);
                                                          newExpanded.delete(expandedProjectCallDetail);
                                                          setExpandedProjectCallDetails(newExpanded);
                                                        }}
                                                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                                        title="Details schließen"
                                                      >
                                                        <X className="h-4 w-4 text-red-500" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                  {/* Project Call Details Table - Same structure as Agent Call Details */}
                                                  <table className="w-full text-xs">
                                                    <thead>
                                                      <tr className="border-b border-gray-200 dark:border-gray-700">
                                                        {[
                                                          { key: 'anzahlAnrufe', label: 'Nr', align: 'left' },
                                                          { key: 'datum', label: 'Datum', align: 'left' },
                                                          { key: 'uhrzeit', label: 'Zeit', align: 'left' },
                                                          { key: 'gespraechsdauer', label: 'Dauer', align: 'left' },
                                                          // DETAIL COLUMNS (Orange) - direkt nach Dauer
                                                          { key: 'wz_test', label: 'WZ (s)', align: 'center', isDetail: true },
                                                          { key: 'gz_test', label: 'GZ (s)', align: 'center', isDetail: true },
                                                          { key: 'nbz_test', label: 'NBZ (s)', align: 'center', isDetail: true },
                                                          { key: 'vbz_test', label: 'VBZ (s)', align: 'center', isDetail: true },
                                                          { key: 'erfolg_test', label: 'Erfolg', align: 'center', isDetail: true },
                                                          { key: 'az_test', label: 'AZ (s)', align: 'center', isDetail: true },
                                                          { key: 'contacts_id', label: 'Contacts ID', align: 'left', isDebug: true },
                                                          { key: 'contacts_campaign_id', label: 'Campaign ID', align: 'left', isDebug: true },
                                                          { key: 'group_id', label: 'Group ID', align: 'left', isDebug: true },
                                                          { key: 'id', label: 'Dialfire Link', align: 'left' },
                                                          { key: 'firmenname', label: 'Firmenname', align: 'left' },
                                                          { key: 'ansprechpartner', label: 'Ansprechpartner', align: 'left' },
                                                          { key: '', label: 'A', align: 'center' },
                                                          { key: '', label: 'T', align: 'center' },
                                                          { key: '', label: 'Notizen', align: 'center' }
                                                        ].filter(column => (!column.isDetail || showDetailColumns) && (!column.isDebug || showDetailColumns)).map((column, idx) => {
                                                          const projectCallDetailKey = `project-${projectStats[0]?.projectId || 'unknown'}-${outcomeName}`;
                                                          const sortState = sortConfig[projectCallDetailKey];
                                                          const isActive = sortState?.key === column.key;
                                                          const canSort = column.key !== '';
                                                          
                                                          return (
                                                            <th 
                                                              key={idx}
                                                              className={`py-2 font-medium text-gray-700 dark:text-gray-300 ${
                                                                column.label === 'A' || column.label === 'T' || column.label === 'Notizen' ? 'px-1 w-10 text-center justify-center' : 'px-3 text-left'
                                                              } ${
                                                                canSort ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none' : ''
                                                              } ${
                                                                column.isDetail ? 'bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400' : ''
                                                              } ${
                                                                column.isDebug ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                                                              }`}
                                                              onClick={() => canSort && handleSort(projectCallDetailKey, column.key)}
                                                              data-testid={`sort-header-${column.key}`}
                                                            >
                                                              <div className={`flex items-center space-x-1 ${column.label === 'A' || column.label === 'T' || column.label === 'Notizen' ? 'justify-center' : 'justify-start'}`}>
                                                                <span>{column.label}</span>
                                                                {canSort && isActive && (
                                                                  <div className="flex flex-col">
                                                                    <ChevronUp 
                                                                      className={`h-3 w-3 ${sortState?.direction === 'asc' ? 'text-blue-600' : 'text-gray-400'}`} 
                                                                    />
                                                                    <ChevronDown 
                                                                      className={`h-3 w-3 -mt-1 ${sortState?.direction === 'desc' ? 'text-blue-600' : 'text-gray-400'}`} 
                                                                    />
                                                                  </div>
                                                                )}
                                                              </div>
                                                            </th>
                                                          );
                                                        })}
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                      {(() => {
                                                        // Apply filtering and sorting to callDetails
                                                        const processedCallDetails = filterAndSortCallDetails(callDetails, `project-${projectStats[0]?.projectId || 'unknown'}-${outcomeName}`);
                                                        
                                                        // Group call details by contacts_id, contacts_campaign_id, and transactions_fired_date
                                                        const createGroupedCallDetails = (processedCallDetails: any[]) => {
                                                          if (processedCallDetails.length === 0) return [];
                                                          
                                                          const groups = new Map<string, {
                                                            key: string;
                                                            contacts_id: string;
                                                            contacts_campaign_id: string; 
                                                            transactions_fired_date: string;
                                                            calls: any[];
                                                            totalDuration: number;
                                                            firstCallTime: Date | null;
                                                            latestCallTime: Date | null;
                                                            latestCallDuration: number;
                                                            hasSuccessfulCall: boolean;
                                                          }>();
                                                          
                                                          processedCallDetails.forEach(call => {
                                                            // Use backend groupId if available, otherwise create composite key
                                                            const groupKey = call.group_id || call.groupId ||
                                                              `${call.contacts_id || call.contactsId || ''}|${call.contacts_campaign_id || call.contactsCampaignId || ''}|${call.transactions_fired_date || call.recordingsDate || call.datum || ''}`;
                                                            
                                                            if (!groups.has(groupKey)) {
                                                              groups.set(groupKey, {
                                                                key: groupKey,
                                                                contacts_id: call.contacts_id || call.contactsId || '',
                                                                contacts_campaign_id: call.contacts_campaign_id || call.contactsCampaignId || '',
                                                                transactions_fired_date: call.transactions_fired_date || call.recordingsDate || call.datum || '',
                                                                calls: [],
                                                                totalDuration: 0,
                                                                firstCallTime: call.callStart ? new Date(call.callStart) : null,
                                                                latestCallTime: call.callStart ? new Date(call.callStart) : null,
                                                                latestCallDuration: call.durationInSeconds || call.duration || 0,
                                                                hasSuccessfulCall: false
                                                              });
                                                            }
                                                            
                                                            const group = groups.get(groupKey)!;
                                                            group.calls.push(call);
                                                            group.totalDuration += call.durationInSeconds || call.duration || 0;
                                                            
                                                            // Check if this call is successful
                                                            if (call.outcomeCategory === 'positive') {
                                                              group.hasSuccessfulCall = true;
                                                            }
                                                            
                                                            // Update first and latest call time
                                                            if (call.callStart) {
                                                              const callTime = new Date(call.callStart);
                                                              if (!isNaN(callTime.getTime())) {
                                                                // Update earliest time
                                                                if (group.firstCallTime === null || callTime < group.firstCallTime) {
                                                                  group.firstCallTime = callTime;
                                                                }
                                                                // Update latest time (for header display)
                                                                if (group.latestCallTime === null || callTime > group.latestCallTime) {
                                                                  group.latestCallTime = callTime;
                                                                  // Also update the duration of the latest call
                                                                  group.latestCallDuration = call.durationInSeconds || call.duration || 0;
                                                                }
                                                              }
                                                            }
                                                          });
                                                          
                                                          // Convert to array and sort by first call time (newest first)
                                                          return Array.from(groups.values()).sort((a, b) => {
                                                            if (!a.firstCallTime && !b.firstCallTime) return 0;
                                                            if (!a.firstCallTime) return 1;
                                                            if (!b.firstCallTime) return -1;
                                                            return b.firstCallTime.getTime() - a.firstCallTime.getTime();
                                                          });
                                                        };
                                                        
                                                        const groupedCallDetails = createGroupedCallDetails(processedCallDetails);
                                                        
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
                                                        
                                                        if (callDetails.length === 0) {
                                                          return (
                                                            <tr>
                                                              <td colSpan={showDetailColumns ? 19 : 10} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                                                                Keine Datensätze für "{outcomeName}" vorhanden
                                                              </td>
                                                            </tr>
                                                          );
                                                        }
                                                        
                                                        if (processedCallDetails.length === 0) {
                                                          return (
                                                            <tr>
                                                              <td colSpan={showDetailColumns ? 19 : 10} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                                                                Keine Anrufe für die gewählten Filter gefunden
                                                              </td>
                                                            </tr>
                                                          );
                                                        }
                                                        
                                                        // Render grouped call details
                                                        return groupedCallDetails.flatMap(group => {
                                                          const isGroupExpanded = expandedGroupIds.has(group.key);
                                                          const groupRows = [];
                                                          
                                                          // If group has only one call, render it directly without group header
                                                          if (group.calls.length === 1) {
                                                            const detail = group.calls[0];
                                                            const isLongCall = (detail.durationInSeconds || detail.duration || 0) > 600;
                                                            const rowBgClass = isLongCall 
                                                              ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30" 
                                                              : "hover:bg-gray-50 dark:hover:bg-gray-800/50";
                                                            
                                                            return [(
                                                              <tr key={`single-${group.key}-${detail.id}`} className={rowBgClass} data-testid={`row-call-${detail.id}`}>
                                                                <td className="px-3 py-2 text-sm">{detail.anzahlAnrufe || 1}</td>
                                                                <td className="px-3 py-2 text-sm">{detail.datum}</td>
                                                                <td className="px-3 py-2 text-sm font-mono">{formatCallTime(detail, t('common.locale'))}</td>
                                                                <td className="px-3 py-2 text-sm font-mono">
                                                                  {Math.floor((detail.durationInSeconds || detail.duration || 0) / 60)}:{((detail.durationInSeconds || detail.duration || 0) % 60).toString().padStart(2, '0')}
                                                                </td>
                                                                {/* DETAIL COLUMNS (Orange) */}
                                                                {showDetailColumns && (
                                                                  <>
                                                                    <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.wz_test || '-'}</td>
                                                                    <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.gz_test || '-'}</td>
                                                                    <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.nbz_test || '-'}</td>
                                                                    <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.vbz_test || '-'}</td>
                                                                    <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.erfolg_test || '-'}</td>
                                                                    <td className="px-3 py-2 text-center text-sm bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400">{detail.az_test || '-'}</td>
                                                                    {/* DEBUG COLUMNS (Yellow) */}
                                                                    <td className="px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20">{detail.contacts_id || detail.contactsId || '-'}</td>
                                                                    <td className="px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20">{detail.contacts_campaign_id || detail.contactsCampaignId || '-'}</td>
                                                                    <td className="px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20">{detail.group_id || detail.groupId || '-'}</td>
                                                                  </>
                                                                )}
                                                                <td className="px-3 py-2 text-sm">
                                                                  {detail.id && (
                                                                    <a 
                                                                      href={`https://app.dialfire.com/${detail.id}`}
                                                                      target="_blank"
                                                                      rel="noopener noreferrer"
                                                                      className="text-blue-600 dark:text-blue-400 hover:underline"
                                                                      title="Dialfire öffnen"
                                                                      data-testid={`link-dialfire-${detail.id}`}
                                                                    >
                                                                      {detail.id.slice(0, 8)}...
                                                                    </a>
                                                                  )}
                                                                </td>
                                                                <td className="px-3 py-2 text-sm">{detail.firmenname || '-'}</td>
                                                                <td className="px-3 py-2 text-sm">{detail.ansprechpartner || '-'}</td>
                                                                {/* Audio Column */}
                                                                <td className="px-1 py-2 text-center w-10">
                                                                  {detail.recordingUrl ? (
                                                                    <Popover>
                                                                      <PopoverTrigger asChild>
                                                                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                                                                          <AudioLines className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                                        </button>
                                                                      </PopoverTrigger>
                                                                      <PopoverContent 
                                                                        className="w-80"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        side="top"
                                                                      >
                                                                        <AudioPlayerTooltip recordingUrl={detail.recordingUrl} callDuration={detail.durationInSeconds || detail.duration} />
                                                                      </PopoverContent>
                                                                    </Popover>
                                                                  ) : (
                                                                    <AudioLines className="h-4 w-4 text-gray-300 mx-auto" />
                                                                  )}
                                                                </td>
                                                                {/* Transcription Column */}
                                                                <td className="px-1 py-2 text-center w-10">
                                                                  {detail.recordingUrl ? (
                                                                    <TranscriptionButton 
                                                                      recordingUrl={detail.recordingUrl}
                                                                      callId={detail.id}
                                                                      callTranscriptionStates={callTranscriptionStates}
                                                                      setCallTranscriptionStates={setCallTranscriptionStates}
                                                                    />
                                                                  ) : (
                                                                    <MessageCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                                                  )}
                                                                </td>
                                                                {/* Notizen Column */}
                                                                <td className="px-1 py-2 text-center w-10 justify-center">
                                                                  <NotizButton 
                                                                    notizText={detail.contacts_notiz}
                                                                    callId={detail.id}
                                                                  />
                                                                </td>
                                                              </tr>
                                                            )];
                                                          }
                                                          
                                                          // Group Header Row - Blue background like in the reference image
                                                          groupRows.push(
                                                            <tr key={`group-${group.key}`} className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200" data-testid={`row-group-header-${group.key}`}>
                                                              <td className="px-3 py-2">
                                                                <button
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleGroupExpansion(group.key);
                                                                  }}
                                                                  className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 font-semibold hover:text-blue-900 dark:hover:text-blue-100"
                                                                  data-testid={`button-toggle-group-${group.key}`}
                                                                >
                                                                  {isGroupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                  <span className="bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded-full text-xs font-bold">
                                                                    ×{group.calls.length}
                                                                  </span>
                                                                </button>
                                                              </td>
                                                              <td className="px-3 py-2 font-semibold">{group.transactions_fired_date}</td>
                                                              <td className="px-3 py-2">
                                                                {group.latestCallTime ? group.latestCallTime.toLocaleTimeString(t('common.locale'), {hour: '2-digit', minute: '2-digit'}) : '-'}
                                                              </td>
                                                              <td className="px-3 py-2 font-mono">
                                                                {Math.floor(group.latestCallDuration / 60).toString().padStart(2, '0')}:{(group.latestCallDuration % 60).toString().padStart(2, '0')}
                                                              </td>
                                                              {/* DETAIL COLUMNS (Orange) - Summary for group */}
                                                              {showDetailColumns && (
                                                                <>
                                                                  <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">-</td>
                                                                  <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">{group.totalDuration}</td>
                                                                  <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">-</td>
                                                                  <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">-</td>
                                                                  <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                    {group.hasSuccessfulCall ? '1' : '0'}
                                                                  </td>
                                                                  <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">{group.totalDuration}</td>
                                                                </>
                                                              )}
                                                              {/* DEBUG COLUMNS for grouping analysis - Group Info */}
                                                              {showDetailColumns && (
                                                                <>
                                                                  <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 font-semibold">{group.contacts_id}</td>
                                                                  <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 font-semibold">{group.contacts_campaign_id}</td>
                                                                  <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-r-2 border-yellow-400 font-semibold">{group.key}</td>
                                                                </>
                                                              )}
                                                              <td className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">
                                          {(() => {
                                            // Find the latest call (matching the latestCallTime)
                                            const latestCall = group.calls.find(call => {
                                              if (!group.latestCallTime) return false;
                                              const callTime = call.callStart ? new Date(call.callStart) : 
                                                (call.datum && call.uhrzeit) ? (() => {
                                                  const [day, month, year] = call.datum.split('.');
                                                  const fullYear = year.length === 2 ? `20${year}` : year;
                                                  const [hours, minutes] = call.uhrzeit.split(':');
                                                  return new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`);
                                                })() : null;
                                              return callTime && Math.abs(callTime.getTime() - group.latestCallTime.getTime()) < 1000; // 1 second tolerance
                                            });
                                            return latestCall?.id || group.calls[0]?.id || '-';
                                          })()}
                                        </td>
                                                              <td className="px-3 py-2 font-semibold">{group.calls[0]?.firmenname || '-'}</td>
                                                              <td className="px-3 py-2 font-semibold">{group.calls[0]?.ansprechpartner || '-'}</td>
                                                              <td className="px-1 py-2 text-center">
                                                                {group.calls.some(c => c.audio || c.recordingUrl) ? <AudioLines className="h-4 w-4 text-blue-600 mx-auto" /> : <AudioLines className="h-4 w-4 text-gray-300 mx-auto" />}
                                                              </td>
                                                              <td className="px-1 py-2 text-center">
                                                                {group.calls.some(c => c.recordingUrl) ? <MessageCircle className="h-4 w-4 text-blue-600 mx-auto" /> : <MessageCircle className="h-4 w-4 text-gray-300 mx-auto" />}
                                                              </td>
                                                              <td className="px-1 py-2 text-center">
                                                                {group.calls.some(c => c.contacts_notiz) ? <FileText className="h-4 w-4 text-blue-600 mx-auto" /> : <FileText className="h-4 w-4 text-gray-300 mx-auto" />}
                                                              </td>
                                                            </tr>
                                                          );
                                                          
                                                          // Individual Call Rows (when group is expanded)
                                                          if (isGroupExpanded) {
                                                            group.calls.forEach((detail, index) => {
                                                              const isLongCall = (detail.durationInSeconds || detail.duration || 0) > 600;
                                                              const rowBgClass = isLongCall 
                                                                ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30" 
                                                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50";
                                                              
                                                              groupRows.push(
                                                                <tr key={`call-${detail.id}-${index}`} className={`${rowBgClass} border-l-4 border-blue-300`} data-testid={`row-call-${detail.id}`}>
                                                                  <td className="px-3 py-2 font-mono pl-8">{detail.anzahlAnrufe}</td>
                                                                  <td className="px-3 py-2 whitespace-nowrap">{detail.datum}</td>
                                                                  <td className="px-3 py-2 whitespace-nowrap">{formatCallTime(detail, t('common.locale'))}</td>
                                                                  <td className="px-3 py-2 font-mono">{detail.gespraechsdauer}</td>
                                                                  {/* DETAIL COLUMNS (Orange) - direkt nach Dauer */}
                                                                  {showDetailColumns && (
                                                                    <>
                                                                      <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                        {detail.waitTimeSeconds ? Math.round(detail.waitTimeSeconds) : '-'}
                                                                      </td>
                                                                      <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                        {detail.durationInSeconds || detail.duration ? Math.round(detail.durationInSeconds || detail.duration) : '-'}
                                                                      </td>
                                                                      <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                        {detail.wrapupTimeSeconds ? Math.round(detail.wrapupTimeSeconds) : '-'}
                                                                      </td>
                                                                      <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                        {detail.editTimeSeconds ? Math.round(detail.editTimeSeconds) : '-'}
                                                                      </td>
                                                                      <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                        {detail.outcomeCategory === 'positive' ? '1' : '0'}
                                                                      </td>
                                                                      <td className="px-3 py-2 text-center bg-orange-100 dark:bg-orange-900/20 border-l-2 border-r-2 border-orange-400 text-orange-800 dark:text-orange-200 font-bold">
                                                                        {detail.workTimeSeconds ? Math.round(detail.workTimeSeconds) : '-'}
                                                                      </td>
                                                                    </>
                                                                  )}
                                                                  {/* DEBUG COLUMNS (Yellow) */}
                                                                  {showDetailColumns && (
                                                                    <>
                                                                      <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400">{detail.contacts_id || detail.contactsId || '-'}</td>
                                                                      <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400">{detail.contacts_campaign_id || detail.contactsCampaignId || '-'}</td>
                                                                      <td className="px-3 py-2 font-mono text-xs bg-yellow-50 dark:bg-yellow-900/20 border-r-2 border-yellow-400">{detail.group_id || detail.groupId || '-'}</td>
                                                                    </>
                                                                  )}
                                                                  {/* Regular columns */}
                                                                  <td className="px-3 py-2">
                                                                    {detail.id ? (
                                                                      <a 
                                                                        href={`https://dialfire.com/link/${detail.id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-600 dark:text-blue-400 hover:underline"
                                                                      >
                                                                        {detail.id}
                                                                      </a>
                                                                    ) : '-'}
                                                                  </td>
                                                                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{detail.firmenname}</td>
                                                                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{detail.ansprechpartner}</td>
                                                                  {/* Audio Column */}
                                                                  <td className="px-1 py-2 text-center w-10">
                                                                    {detail.recordingUrl ? (
                                                                      <Popover>
                                                                        <PopoverTrigger asChild>
                                                                          <AudioLines 
                                                                            className="h-4 w-4 text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-800 dark:hover:text-blue-200 transition-colors mx-auto" 
                                                                          />
                                                                        </PopoverTrigger>
                                                                        <PopoverContent 
                                                                          className="p-4 w-80" 
                                                                          onClick={(e) => e.stopPropagation()}
                                                                          side="top"
                                                                        >
                                                                          <AudioPlayerTooltip recordingUrl={detail.recordingUrl} callDuration={detail.durationInSeconds || detail.duration} />
                                                                        </PopoverContent>
                                                                      </Popover>
                                                                    ) : (
                                                                      <AudioLines className="h-4 w-4 text-gray-300 mx-auto" />
                                                                    )}
                                                                  </td>
                                                                  {/* Transcription Column */}
                                                                  <td className="px-1 py-2 text-center w-10">
                                                                    {detail.recordingUrl ? (
                                                                      <TranscriptionButton 
                                                                        recordingUrl={detail.recordingUrl}
                                                                        callId={detail.id}
                                                                        callTranscriptionStates={callTranscriptionStates}
                                                                        setCallTranscriptionStates={setCallTranscriptionStates}
                                                                      />
                                                                    ) : (
                                                                      <MessageCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                                                    )}
                                                                  </td>
                                                                  {/* Notizen Column */}
                                                                  <td className="px-1 py-2 text-center w-10 justify-center">
                                                                    <NotizButton 
                                                                      notizText={detail.contacts_notiz}
                                                                      callId={detail.id}
                                                                    />
                                                                  </td>
                                                                </tr>
                                                              );
                                                            });
                                                          }
                                                          
                                                          return groupRows;
                                                        });
                                                      })()}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  )}

                </thead>
                <tbody>
                  {/* Expandable Project Details - Show grouped by day */}
                  {isExpanded && (() => {
                    // Group statistics by day of the week
                    const dayGroups = agentStats.reduce((groups, stat) => {
                      const statDate = new Date(stat.date);
                      const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
                      const dayName = dayNames[statDate.getDay()];
                      
                      if (!groups[dayName]) {
                        groups[dayName] = [];
                      }
                      groups[dayName].push(stat);
                      return groups;
                    }, {} as Record<string, typeof agentStats>);

                    // Sort day groups by weekday order (Monday first)
                    const dayOrder = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
                    const sortedDayGroups = Object.entries(dayGroups).sort(([a], [b]) => {
                      return dayOrder.indexOf(a) - dayOrder.indexOf(b);
                    });
                    
                    // Create rows grouped by day: summary row followed by individual project rows
                    const groupedRows = sortedDayGroups.flatMap(([dayName, dayStats]) => {
                      // Calculate day totals
                      const dayTotals = dayStats.reduce((total, stat) => ({
                        anzahl: total.anzahl + stat.anzahl,
                        abgeschlossen: total.abgeschlossen + stat.abgeschlossen,
                        erfolgreich: total.erfolgreich + stat.erfolgreich,
                        wartezeit: total.wartezeit + stat.wartezeit,
                        gespraechszeit: total.gespraechszeit + stat.gespraechszeit,
                        nachbearbeitungszeit: total.nachbearbeitungszeit + stat.nachbearbeitungszeit,
                        vorbereitungszeit: total.vorbereitungszeit + stat.vorbereitungszeit,
                        erfolgProStunde: total.erfolgProStunde + stat.erfolgProStunde,
                        arbeitszeit: total.arbeitszeit + stat.arbeitszeit,
                      }), {
                        anzahl: 0, abgeschlossen: 0, erfolgreich: 0, wartezeit: 0,
                        gespraechszeit: 0, nachbearbeitungszeit: 0, vorbereitungszeit: 0,
                        erfolgProStunde: 0, arbeitszeit: 0
                      });

                      // Create summary row for the day
                      const summaryRow = (
                        <tr key={`${agent.id}-summary-${dayName}`} className="bg-blue-50 dark:bg-blue-950/30 border-t-2 border-blue-200 dark:border-blue-800">
                          <td className="pl-4 text-sm font-medium text-blue-700 dark:text-blue-300 px-4 py-2 whitespace-nowrap">{t ? t(`emptyStates.${({ Montag:'monday', Dienstag:'tuesday', Mittwoch:'wednesday', Donnerstag:'thursday', Freitag:'friday', Samstag:'saturday', Sonntag:'sunday' } as Record<string,string>)[dayName] || dayName.toLowerCase()}`) : dayName} {t ? t('emptyStates.inTotal') : 'in Summe:'}</td>
                          <td className="px-4 py-2"></td>
                          <td className="font-medium px-4 py-2 text-right">{dayTotals.anzahl}</td>
                          <td className="font-medium px-4 py-2 text-right">{dayTotals.abgeschlossen}</td>
                          <td className="font-medium px-4 py-2 text-right">{dayTotals.erfolgreich}</td>
                          <td className="font-medium px-4 py-2 text-right">{(dayTotals.wartezeit || 0).toFixed(2)}</td>
                          <td className="font-medium px-4 py-2 text-right">{(dayTotals.gespraechszeit || 0).toFixed(2)}</td>
                          <td className="font-medium px-4 py-2 text-right">{(dayTotals.nachbearbeitungszeit || 0).toFixed(2)}</td>
                          <td className="font-medium px-4 py-2 text-right">{(dayTotals.vorbereitungszeit || 0).toFixed(2)}</td>
                          <td className="font-medium px-4 py-2 text-right">{(dayTotals.erfolgProStunde || 0).toFixed(2)}</td>
                          <td className="font-medium px-4 py-2 text-right">{(dayTotals.arbeitszeit || 0).toFixed(2)}</td>
                        </tr>
                      );

                      // Create individual project rows for this day
                      const dayProjectRows = dayStats.map(stat => {
                        const projectName = getProjectName(stat.projectId);
                        const statDate = new Date(stat.date);
                        const formattedDate = statDate.toLocaleDateString(t('common.locale'), { day: '2-digit', month: '2-digit', year: 'numeric' });
                        
                        return (
                          <tr key={`${agent.id}-${stat.projectId}-${stat.date}`} className="bg-muted/20 hover:bg-muted/30 transition-colors">
                            <td className="pl-8 text-sm text-muted-foreground px-4 py-2">{projectName}</td>
                            <td className="text-xs text-muted-foreground px-4 py-2 whitespace-nowrap">{formattedDate}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-anzahl-${agent.id}-${stat.projectId}-${stat.date}`}>{stat.anzahl}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-abgeschlossen-${agent.id}-${stat.projectId}-${stat.date}`}>{stat.abgeschlossen}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-erfolgreich-${agent.id}-${stat.projectId}-${stat.date}`}>{stat.erfolgreich}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-wartezeit-${agent.id}-${stat.projectId}-${stat.date}`}>{(stat.wartezeit || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-gespraechszeit-${agent.id}-${stat.projectId}-${stat.date}`}>{(stat.gespraechszeit || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-nachbearbeitung-${agent.id}-${stat.projectId}-${stat.date}`}>{(stat.nachbearbeitungszeit || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-vorbereitung-${agent.id}-${stat.projectId}-${stat.date}`}>{(stat.vorbereitungszeit || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-erfolg-${agent.id}-${stat.projectId}-${stat.date}`}>{(stat.erfolgProStunde || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm text-right" data-testid={`cell-project-arbeitszeit-${agent.id}-${stat.projectId}-${stat.date}`}>{(stat.arbeitszeit || 0).toFixed(2)}</td>
                          </tr>
                        );
                      });

                      // Return summary row followed by individual project rows for this day
                      return [summaryRow, ...dayProjectRows];
                    });

                    return groupedRows;
                  })()}
                </tbody>
              </Table>
            </div>
          </div>
        );
      })}

    </div>
    </>
  );
}
