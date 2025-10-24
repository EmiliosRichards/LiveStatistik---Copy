/**
 * Cache warmer - pre-loads chart data on server startup
 * This ensures charts load instantly for users by warming the cache
 */

export async function warmChartCache() {
  console.log('🔥 Cache Warmer: Starting chart cache pre-warming...');
  
  const baseUrl = 'http://127.0.0.1:5001';
  const currentYear = new Date().getFullYear();
  const startOfYear = `${currentYear}-01-01`;
  const today = new Date().toISOString().split('T')[0];

  const endpoints = [
    { url: `/api/monthly-call-trends?year=${currentYear}`, name: 'Monthly Trends' },
    { url: `/api/outcome-distribution?dateFrom=${startOfYear}&dateTo=${today}`, name: 'Outcome Distribution' }
  ];

  const results = await Promise.allSettled(
    endpoints.map(async ({ url, name }) => {
      const startTime = Date.now();
      try {
        const response = await fetch(`${baseUrl}${url}`, {
          signal: AbortSignal.timeout(120000) // 2 minute timeout
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const duration = Date.now() - startTime;
        console.log(`✅ Cache Warmer: ${name} loaded in ${(duration / 1000).toFixed(1)}s`);
        return { name, success: true, duration };
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.log(`⚠️ Cache Warmer: ${name} failed after ${(duration / 1000).toFixed(1)}s - ${error.message}`);
        return { name, success: false, error: error.message };
      }
    })
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  console.log(`🔥 Cache Warmer: Completed ${successful}/${endpoints.length} endpoints`);
}
