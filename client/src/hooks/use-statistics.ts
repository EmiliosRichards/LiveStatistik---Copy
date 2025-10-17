import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type StatisticsFilter, type Agent } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function useStatistics(filters: StatisticsFilter) {
  return useQuery({
    queryKey: ["/api/statistics", filters],
    queryFn: async ({ signal }) => {
      console.log('🔄 Fetching statistics...');
      
      // Create AbortController for 5-minute timeout to match server timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
      
      try {
        const response = await fetch("/api/statistics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filters),
          signal: controller.signal, // Use our timeout controller instead of query signal
          credentials: "include",
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          throw new Error(`${response.status}: ${text}`);
        }
        
        const data = await response.json();
        console.log('✅ Statistics received:', data?.length, 'records');
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('⏰ Statistics request timed out after 5 minutes');
          throw new Error('Die Statistik-Abfrage hat zu lange gedauert (über 5 Minuten). Bitte versuchen Sie es mit einem kleineren Datumsbereich oder wenden Sie sich an den Support.');
        }
        throw error;
      }
    },
    refetchInterval: false, // DISABLED: Refetch disabled - statistics now manually controlled via dashboard
    staleTime: Infinity, // Keep data fresh indefinitely - manual control only
    gcTime: 30000, // Longer cache time since manual control
    retry: 1, // Only retry once on timeout
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["/api/agents"],
    refetchInterval: 60000, // Refetch every minute for status updates
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["/api/projects"],
  });
}

// REMOVED: useCallOutcomes hook - replaced with dynamic category system
// export function useCallOutcomes() {
//   return useQuery({
//     queryKey: ["/api/call-outcomes"],
//   });
// }

export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ agentId, status }: { agentId: string; status: Agent['currentStatus'] }) => {
      return apiRequest("PATCH", `/api/agents/${agentId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    },
  });
}

export function useCallDetails(agentId: string, projectId: string, dateFrom?: string, dateTo?: string, timeFrom?: string, timeTo?: string) {
  // Build the URL with query parameters
  const params = new URLSearchParams();
  if (dateFrom) params.append('dateFrom', dateFrom);
  if (dateTo) params.append('dateTo', dateTo);
  if (timeFrom) params.append('timeFrom', timeFrom);
  if (timeTo) params.append('timeTo', timeTo);
  
  const url = `/api/call-details/${agentId}/${projectId}${params.toString() ? '?' + params.toString() : ''}`;
  
  console.log('🔍 Frontend useCallDetails URL with time filters:', url);
  
  return useQuery({
    queryKey: ['/api/call-details', agentId, projectId, dateFrom, dateTo, timeFrom, timeTo],
    queryFn: async () => {
      console.log('🔄 Fetching call details...');
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch(url, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch call details: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Call details received:', data?.length, 'records');
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('⏰ Call details request timed out after 10s');
          throw new Error('Request timed out - returning empty result');
        }
        throw error;
      }
    },
    enabled: !!agentId && !!projectId,
    staleTime: 30000, // Cache for 30 seconds to avoid constant reloading
    refetchInterval: false, // Disable automatic refetch - we'll use intelligent updates
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1, // Only retry once on failure
  });
}

// New hook for intelligent call details updates
export function useIntelligentCallDetails(agentId: string, projectId: string, dateFrom?: string, dateTo?: string, timeFrom?: string, timeTo?: string, refreshTrigger?: number) {
  const queryClient = useQueryClient();
  
  // Build the URL with query parameters
  const params = new URLSearchParams();
  if (dateFrom) params.append('dateFrom', dateFrom);
  if (dateTo) params.append('dateTo', dateTo);
  if (timeFrom) params.append('timeFrom', timeFrom);
  if (timeTo) params.append('timeTo', timeTo);
  
  const url = `/api/call-details/${agentId}/${projectId}${params.toString() ? '?' + params.toString() : ''}`;
  const queryKey = ['/api/call-details', agentId, projectId, dateFrom, dateTo, timeFrom, timeTo];
  
  // Hook for getting new/updated call details since last fetch
  const checkForUpdates = async (lastCallIds: string[] = []) => {
    const updatesParams = new URLSearchParams(params);
    if (lastCallIds.length > 0) {
      updatesParams.append('afterIds', lastCallIds.slice(-10).join(',')); // Check after last 10 IDs
    }
    
    const updatesUrl = `/api/call-details/${agentId}/${projectId}/updates${updatesParams.toString() ? '?' + updatesParams.toString() : ''}`;
    
    try {
      const response = await fetch(updatesUrl);
      if (!response.ok) {
        // Fall back to full refresh if updates endpoint doesn't exist
        const fullResponse = await fetch(url);
        if (fullResponse.ok) {
          return { isFullRefresh: true, data: await fullResponse.json() };
        }
        throw new Error('Failed to fetch call details');
      }
      
      const newData = await response.json();
      return { isFullRefresh: false, data: newData };
    } catch (error) {
      console.log('⚠️ Updates endpoint not available, falling back to full refresh');
      const fullResponse = await fetch(url);
      if (fullResponse.ok) {
        return { isFullRefresh: true, data: await fullResponse.json() };
      }
      throw error;
    }
  };
  
  // Initial query
  const query = useQuery({
    queryKey: [...queryKey, refreshTrigger],
    queryFn: async () => {
      console.log('🔄 Fetching initial call details...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch call details: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Initial call details received:', data?.length, 'records');
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('⏰ Call details request timed out after 10s');
          throw new Error('Request timed out - returning empty result');
        }
        throw error;
      }
    },
    enabled: !!agentId && !!projectId,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  
  return {
    ...query,
    checkForUpdates,
    appendNewData: (newCallDetails: any[]) => {
      queryClient.setQueryData([...queryKey, refreshTrigger], (oldData: any[] | undefined) => {
        if (!oldData) return newCallDetails;
        
        // Filter out duplicates based on ID
        const existingIds = new Set(oldData.map((call: any) => call.id));
        const trulyNewCalls = newCallDetails.filter((call: any) => !existingIds.has(call.id));
        
        if (trulyNewCalls.length > 0) {
          console.log(`✨ Appending ${trulyNewCalls.length} new call details`);
          return [...oldData, ...trulyNewCalls];
        }
        
        return oldData;
      });
    },
    replaceData: (newData: any[]) => {
      console.log('🔄 Full refresh of call details data');
      queryClient.setQueryData([...queryKey, refreshTrigger], newData);
    }
  };
}
