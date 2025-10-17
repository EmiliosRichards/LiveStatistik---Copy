import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

interface CampaignCategories {
  campaignId: string;
  categories: {
    open: string[];
    success: string[];
    declined: string[];
  };
}

export function useCampaignCategories(campaignId?: string) {
  return useQuery({
    queryKey: ['campaign-categories', campaignId],
    queryFn: async () => {
      const url = campaignId 
        ? `/api/campaign-categories/${encodeURIComponent(campaignId)}`
        : '/api/campaign-categories';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch campaign categories');
      }
      return response.json() as Promise<CampaignCategories>;
    },
    enabled: !!campaignId, // Only run if campaignId is provided
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 3,
  });
}

// Hook to get all campaign categories when no specific campaigns are known
export function useAllCampaignCategories() {
  return useQuery({
    queryKey: ['campaign-categories', 'all'],
    queryFn: async () => {
      console.log('🔧 HOOK DEBUG: Fetching categories from /api/campaign-categories');
      const response = await fetch('/api/campaign-categories');
      if (!response.ok) {
        throw new Error('Failed to fetch all campaign categories');
      }
      const data = await response.json();
      console.log('🔧 HOOK DEBUG: Raw API response:', data);
      
      // Server returns single object: { campaignId: "all", categories: {...} }
      // Just return the data directly, not as a Map
      return data;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 3,
  });
}

// Helper function to get categories for multiple campaigns - FIXED: No dynamic hooks!
export function useCampaignCategoriesMap(campaignIds: string[]) {
  // ALWAYS call the same hook - no dynamic calls!
  const allCategoriesQuery = useAllCampaignCategories();
  
  // Use useMemo to create filtered map based on campaign IDs
  const categoriesMap = useMemo(() => {
    const map = new Map<string, CampaignCategories['categories']>();
    
    if (allCategoriesQuery.data && !allCategoriesQuery.isLoading && !allCategoriesQuery.isError) {
      // API returns { campaignId: "all", categories: { open: [...], success: [...], declined: [...] } }
      const apiResponse = allCategoriesQuery.data as any;
      console.log('🔧 HOOK DEBUG: API Response received:', apiResponse);
      
      if (apiResponse && apiResponse.categories) {
        console.log('🔧 HOOK DEBUG: Categories found:', apiResponse.categories);
        console.log('🔧 HOOK DEBUG: Campaign IDs to process:', campaignIds);
        
        if (campaignIds.length > 0) {
          // Use the same categories for all requested campaign IDs
          campaignIds.forEach(campaignId => {
            map.set(campaignId, apiResponse.categories);
            console.log(`🔧 HOOK DEBUG: Set categories for campaign ${campaignId}`);
          });
        } else {
          // Use categories for 'all' when no specific IDs
          map.set('all', apiResponse.categories);
          console.log('🔧 HOOK DEBUG: Set categories for "all" campaign');
        }
      } else {
        console.log('🔧 HOOK DEBUG: No categories found in response');
      }
    }
    
    return map;
  }, [campaignIds, allCategoriesQuery.data, allCategoriesQuery.isLoading, allCategoriesQuery.isError]);
  
  return {
    categoriesMap,
    isLoading: allCategoriesQuery.isLoading,
    isError: allCategoriesQuery.isError,
    errors: allCategoriesQuery.error ? [allCategoriesQuery.error] : [],
  };
}