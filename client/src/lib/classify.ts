/**
 * Dynamic outcome classification utilities
 */

// Normalization helper for consistent matching
export const normalizeOutcome = (outcome: string): string => {
  return outcome?.toString().trim().toLowerCase().replaceAll(" ", "_");
};

// Helper function to classify outcomes using dynamic categories
export const classifyOutcome = (
  outcomeName: string, 
  categoriesMap: Map<string, any>
): 'positive' | 'negative' | 'offen' => {
  console.log(`🎯 CLASSIFY UTILITY: "${outcomeName}" with categoriesMap size:`, categoriesMap.size);
  
  if (categoriesMap.size === 0) {
    console.log(`⚠️ No categories map available, defaulting to offen for "${outcomeName}"`);
    return 'offen';
  }
  
  const normalized = normalizeOutcome(outcomeName);
  console.log(`🔍 NORMALIZED: "${outcomeName}" -> "${normalized}"`);
  
  // Check all categories from the map
  for (const [campaignId, categories] of Array.from(categoriesMap.entries())) {
    console.log(`📋 Checking campaign ${campaignId} categories:`, categories);
    
    if (categories.success?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
      console.log(`✅ MATCH FOUND: "${outcomeName}" is SUCCESS in campaign ${campaignId}`);
      return 'positive';
    }
    
    if (categories.declined?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
      console.log(`❌ MATCH FOUND: "${outcomeName}" is DECLINED in campaign ${campaignId}`);
      return 'negative';
    }
    
    if (categories.open?.some((cat: string) => normalizeOutcome(cat) === normalized)) {
      console.log(`📋 MATCH FOUND: "${outcomeName}" is OPEN in campaign ${campaignId}`);
      return 'offen';
    }
  }
  
  console.log(`❓ NO MATCH: "${outcomeName}" not found in any category, defaulting to offen`);
  return 'offen';
};