import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Wifi, WifiOff, Database, Clock, Loader2, Zap, ZapOff, RefreshCw, AlertCircle, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DatabaseStatus {
  connected: boolean;
  lastCheck: Date;
  wasEverConnected: boolean;
  isChecking: boolean;
  initialCheckDone: boolean;
  disconnectedSince: Date | null;
}

interface DialfireStatus {
  connected: boolean;
  lastCheck: Date;
  wasEverConnected: boolean;
  isChecking: boolean;
  initialCheckDone: boolean;
  disconnectedSince: Date | null;
}

interface DatabaseStatusResponse {
  connected: boolean;
  timestamp: string;
  database: string;
  error?: string;
}

interface DialfireStatusResponse {
  connected: boolean;
  timestamp: string;
  service: string;
  campaigns_count?: number;
  error?: string;
}

interface AppFooterProps {
  lastUpdateTime?: Date;
  refetchIntervalMs?: number;
  isEnabled?: boolean;
}

export function AppFooter({ lastUpdateTime, refetchIntervalMs, isEnabled }: AppFooterProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({
    connected: false,
    lastCheck: new Date(),
    wasEverConnected: false,
    isChecking: true, // Start as checking
    initialCheckDone: false,
    disconnectedSince: null,
  });
  const [dbErrorDialogOpen, setDbErrorDialogOpen] = useState(false);
  const [dialfireStatus, setDialfireStatus] = useState<DialfireStatus>({
    connected: false,
    lastCheck: new Date(),
    wasEverConnected: false,
    isChecking: true,
    initialCheckDone: false,
    disconnectedSince: null,
  });
  const [refreshCount, setRefreshCount] = useState(0);
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dialfireNotificationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Test external database connectivity directly
  const { data: dbStatusData, error: dbStatusError, isLoading: dbStatusLoading, dataUpdatedAt } = useQuery<DatabaseStatusResponse>({
    queryKey: ["/api/database-status"],
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1,
  });

  // Test Dialfire API connectivity
  const { data: dialfireStatusData, error: dialfireStatusError, isLoading: dialfireStatusLoading } = useQuery<DialfireStatusResponse>({
    queryKey: ["/api/dialfire-status"],
    refetchInterval: 60000, // Check every minute (less frequent than database)
    retry: 1,
  });
  
  // Track when data was last updated
  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setDbStatus(prev => ({
        ...prev,
        lastCheck: new Date(dataUpdatedAt),
      }));
    }
  }, [dataUpdatedAt]);

  useEffect(() => {
    // Update timestamp whenever loading state changes (including from true to false)
    if (dbStatusLoading) {
      setDbStatus(prev => ({
        ...prev,
        isChecking: true,
      }));
    } else {
      // Always update lastCheck when loading finishes, regardless of success/error
      if (dbStatusData && dbStatusData.connected && !dbStatusError) {
        // Clear any existing notification timer when connected
        if (notificationTimerRef.current) {
          clearTimeout(notificationTimerRef.current);
          notificationTimerRef.current = null;
        }
        
        setDbStatus(prev => ({
          connected: true,
          lastCheck: new Date(),
          wasEverConnected: true,
          isChecking: false,
          initialCheckDone: true,
          disconnectedSince: null,
        }));
      } else if (dbStatusError || (dbStatusData && !dbStatusData.connected)) {
        setDbStatus(prev => {
          const wasConnectedBefore = prev.wasEverConnected;
          const initialCheck = !prev.initialCheckDone;
          const nowDisconnected = new Date();
          const wasAlreadyDisconnected = prev.disconnectedSince !== null;
          
          // Only start timer if this is the first time we're disconnected
          if (!wasAlreadyDisconnected && !notificationTimerRef.current) {
            notificationTimerRef.current = setTimeout(() => {
              toast({
                title: `⚠️ ${t('footer.dbConnectionFailed')}`,
                description: t('footer.dbConnectionFailedDescription'),
                variant: "destructive",
              });
              notificationTimerRef.current = null;
            }, 5000); // 5 seconds delay
          }
          
          return {
            connected: false,
            lastCheck: new Date(),
            wasEverConnected: wasConnectedBefore,
            isChecking: false,
            initialCheckDone: true,
            disconnectedSince: prev.disconnectedSince || nowDisconnected,
          };
        });
      }
    }
  }, [dbStatusLoading, dbStatusData, dbStatusError, toast]);

  // Handle Dialfire status updates
  useEffect(() => {
    if (dialfireStatusLoading) {
      setDialfireStatus(prev => ({
        ...prev,
        isChecking: true,
      }));
    } else {
      if (dialfireStatusData && dialfireStatusData.connected && !dialfireStatusError) {
        // Clear any existing notification timer when connected
        if (dialfireNotificationTimerRef.current) {
          clearTimeout(dialfireNotificationTimerRef.current);
          dialfireNotificationTimerRef.current = null;
        }
        
        setDialfireStatus(prev => ({
          connected: true,
          lastCheck: new Date(),
          wasEverConnected: true,
          isChecking: false,
          initialCheckDone: true,
          disconnectedSince: null,
        }));
      } else if (dialfireStatusError || (dialfireStatusData && !dialfireStatusData.connected)) {
        setDialfireStatus(prev => {
          const wasAlreadyDisconnected = prev.disconnectedSince !== null;
          
          // Only start timer if this is the first time we're disconnected
          if (!wasAlreadyDisconnected && !dialfireNotificationTimerRef.current) {
            dialfireNotificationTimerRef.current = setTimeout(() => {
              toast({
                title: `⚠️ ${t('footer.dialfireConnectionFailed')}`,
                description: t('footer.dialfireConnectionFailedDescription'),
                variant: "destructive",
              });
              dialfireNotificationTimerRef.current = null;
            }, 5000); // 5 seconds delay
          }
          
          return {
            connected: false,
            lastCheck: new Date(),
            wasEverConnected: prev.wasEverConnected,
            isChecking: false,
            initialCheckDone: true,
            disconnectedSince: prev.disconnectedSince || new Date(),
          };
        });
      }
    }
  }, [dialfireStatusLoading, dialfireStatusData, dialfireStatusError, toast]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      if (dialfireNotificationTimerRef.current) {
        clearTimeout(dialfireNotificationTimerRef.current);
      }
    };
  }, []);

  const formatLastCheck = (date: Date) => {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: t('footer.copied'),
        description: t('footer.copiedDescription'),
      });
    });
  };

  const extractIPFromError = (errorMessage?: string): string | null => {
    if (!errorMessage) return null;
    // Extract IP address from error message like: "no pg_hba.conf entry for host "130.211.125.214""
    const ipMatch = errorMessage.match(/host\s+"([0-9.]+)"/);
    return ipMatch ? ipMatch[1] : null;
  };

  const getRecommendedIPRanges = (currentIP?: string) => {
    if (!currentIP) {
      // Fallback general Google Cloud ranges
      return [
        '130.211.112.0/20',
        '130.211.128.0/18', 
        '130.211.64.0/19',
        '130.211.96.0/20',
      ];
    }

    // Generate specific ranges based on current IP
    const ipParts = currentIP.split('.').map(Number);
    if (ipParts.length !== 4) return [];

    const thirdOctet = ipParts[2];
    const ranges = [];

    // Calculate the specific /20 range that contains this IP
    const rangeStart = Math.floor(thirdOctet / 16) * 16;
    ranges.push(`130.211.${rangeStart}.0/20`);

    // Add some common neighboring ranges
    if (rangeStart > 0) {
      ranges.push(`130.211.${rangeStart - 16}.0/20`);
    }
    if (rangeStart < 240) {
      ranges.push(`130.211.${rangeStart + 16}.0/20`);
    }

    return ranges;
  };

  return (
    <footer className="bg-card border-t border-border px-6 py-3 flex-shrink-0">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {/* Left side - Version info */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="font-mono">v1.0 PREVIEW</span>
            <span className="text-xs">•</span>
            <span>Teamleiter Live-Statistik</span>
          </div>
        </div>

        {/* Right side - Database & Dialfire status */}
        <div className="flex items-center space-x-4">
          {/* Database Status */}
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4" />
            <span>{t('footer.database')}:</span>
            <div className="flex items-center space-x-1">
              {dbStatus.isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                </>
              ) : dbStatus.connected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">{t('footer.connected')}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <AlertDialog open={dbErrorDialogOpen} onOpenChange={setDbErrorDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 dark:text-red-400 h-auto p-0 hover:bg-transparent hover:text-red-700 dark:hover:text-red-300"
                        data-testid="button-database-error-details"
                      >
                        {t('footer.disconnected')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-2xl" data-testid="dialog-database-error">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-red-500" />
                          {t('footer.dbConnectionFailed')}
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-4 text-left">
                            <div>
                              <h4 className="font-semibold mb-2">{t('footer.problem')}</h4>
                              <p className="text-sm">
                                Die externe PostgreSQL-Datenbank "dialfire" lehnt Verbindungen von der aktuellen Replit-Server-IP ab.
                              </p>
                            </div>
                            
                            {dbStatusData?.error && (
                              <div>
                                <h4 className="font-semibold mb-2">{t('footer.errorMessage')}</h4>
                                <div className="bg-muted p-3 rounded-md font-mono text-xs break-words">
                                  {dbStatusData.error}
                                </div>
                              </div>
                            )}

                            {(() => {
                              const currentIP = extractIPFromError(dbStatusData?.error);
                              return currentIP ? (
                                <div>
                                  <h4 className="font-semibold mb-2">{t('footer.currentServerIP')}</h4>
                                  <div className="flex items-center gap-2">
                                    <code className="bg-muted px-2 py-1 rounded text-sm">{currentIP}</code>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleCopyToClipboard(currentIP)}
                                      className="h-6 w-6 p-0"
                                      data-testid="button-copy-ip"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ) : null;
                            })()}

                            <div>
                              <h4 className="font-semibold mb-2">{t('footer.solutionRecommendation')}</h4>
                              <p className="text-sm mb-2">
                                {t('footer.addIPRanges')}
                              </p>
                              <div className="bg-muted p-3 rounded-md">
                                {getRecommendedIPRanges(extractIPFromError(dbStatusData?.error) || undefined).map((range, index) => (
                                  <div key={range} className="flex items-center justify-between py-1">
                                    <code className="text-xs font-mono">
                                      host    dialfire    kubrakiv    {range}    md5
                                    </code>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleCopyToClipboard(`host    dialfire    kubrakiv    ${range}    md5`)}
                                      className="h-6 w-6 p-0 ml-2"
                                      data-testid={`button-copy-range-${index}`}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                {t('footer.afterChange')} <code>sudo systemctl reload postgresql</code>
                              </p>
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogAction data-testid="button-close-dialog">
                          {t('footer.understood')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>
          
          <span className="text-xs">•</span>
          
          {/* Dialfire Status */}
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4" />
            <span>{t('footer.dialfireApi')}:</span>
            <div className="flex items-center space-x-1">
              {dialfireStatus.isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                </>
              ) : dialfireStatus.connected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">{t('footer.connected')}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-red-600 dark:text-red-400">{t('footer.disconnected')}</span>
                </>
              )}
            </div>
          </div>
          
          {/* Live Update Indicator - moved from header */}
          {lastUpdateTime && isEnabled && (
            <>
              <span className="text-xs">•</span>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <span className="text-xs">{t('footer.updated')}:</span>
                  <span className="text-xs font-medium">
                    {lastUpdateTime.toLocaleTimeString('de-DE', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
                {refetchIntervalMs === 10000 && (
                  <>
                    <span className="text-xs">•</span>
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center">
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      {t('footer.live')} (10s)
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}