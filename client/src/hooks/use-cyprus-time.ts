import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface CyprusTimeData {
  datetime: string;
  timezone: string;
  utc_offset: string;
  unixtime: number;
  fallback?: boolean;
}

export function useCyprusTime() {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Fetch Cyprus time from server every 5 minutes
  const { data: cyprusTimeData, isLoading, error, refetch } = useQuery<CyprusTimeData>({
    queryKey: ["/api/cyprus-time"],
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    staleTime: 4 * 60 * 1000, // 4 minutes
  });

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    // Always use the current time, but format it in Cyprus timezone
    // This is more reliable than trying to calculate offsets
    intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Set initial time
    setCurrentTime(new Date());

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [cyprusTimeData]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Europe/Nicosia'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Nicosia'
    });
  };

  return {
    currentTime,
    formattedTime: formatTime(currentTime),
    formattedDate: formatDate(currentTime),
    timezone: cyprusTimeData?.timezone || 'Europe/Nicosia',
    utcOffset: cyprusTimeData?.utc_offset || '+02:00',
    isServerTime: !!cyprusTimeData && !cyprusTimeData.fallback,
    isLoading,
    error,
    refreshTime: refetch
  };
}