import pkg from 'pg';
const { Pool } = pkg;

// External database connection (Read-Only)
const externalDbConfig = {
  host: process.env.EXTERNAL_DB_HOST,
  database: process.env.EXTERNAL_DB_DATABASE,
  user: process.env.EXTERNAL_DB_USER,
  password: process.env.EXTERNAL_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 60000, // 60 seconds for connection
  idleTimeoutMillis: 300000, // 5 minutes idle timeout
  max: 10, // Increase connections
  statement_timeout: 300000, // 5 minute timeout for queries
  query_timeout: 300000 // 5 minute timeout for query execution
};

const hasExternalDbConfig = process.env.EXTERNAL_DB_HOST && 
  process.env.EXTERNAL_DB_DATABASE && 
  process.env.EXTERNAL_DB_USER && 
  process.env.EXTERNAL_DB_PASSWORD;

if (!hasExternalDbConfig) {
  console.warn("⚠️ External database environment variables not set. External database features will be disabled.");
}

export const externalPool = hasExternalDbConfig ? new Pool(externalDbConfig) : null;

// Helper function to check if external database is available
function checkExternalDb() {
  if (!externalPool) {
    throw new Error("External database is not configured. Please set EXTERNAL_DB_HOST, EXTERNAL_DB_DATABASE, EXTERNAL_DB_USER, and EXTERNAL_DB_PASSWORD environment variables.");
  }
}

// Type definitions for external database views
export interface AgentData {
  transaction_id?: string;    // Transaction ID for DISTINCT ON queries
  transactions_fired_date: string;
  recordings_start_time: string;
  connections_duration: number;
  transactions_user_login: string;
  transactions_status: string;
  transactions_status_detail: string;
  recordings_started: string;
  recordings_stopped: string;
  recordings_location: string;
  connections_phone: string;
  contacts_campaign_id: string;
  contacts_id?: string;       // Contact ID for grouping
  // NEW: Test columns for Call-Details
  transactions_wrapup_time_sec?: number; // Wrapup time (not used for NBZ/VBZ)
  transactions_wait_time_sec?: number;   // WZ (s) - Wartezeit
  transactions_edit_time_sec?: number;   // NBZ (s) - Nachbearbeitungszeit
  transactions_pause_time_sec?: number;  // VBZ (s) - Vorbereitungszeit
  // NEW: Contact information fields
  contacts_firma?: string;   // Firmenname
  contacts_notiz?: string;   // Notizen
  contacts_name?: string;    // Ansprechpartner (Contact Person) - legacy
  contacts_full_name?: string;    // Vollständiger Ansprechpartner Name
}

export interface CampaignAgentReference {
  contacts_campaign_id: string;
  transactions_user_login: string;
}

export interface CampaignStateReference {
  contacts_campaign_id: string;
  transactions_status_detail: string;
  transactions_status: string; // 'declined', 'success', 'open'
}

// Read-only query functions
export async function getAgentData(limit?: number, offset?: number, dateFrom?: string, dateTo?: string): Promise<AgentData[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    // PERFORMANCE: Add reasonable default limit to prevent huge queries
    const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 10000';
    const offsetClause = offset ? `OFFSET ${offset}` : '';
    
    // SECURITY FIX: Use parameterized queries to prevent SQL injection
    const conditions = [];
    const params: any[] = [];
    
    if (dateFrom && dateTo) {
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      conditions.push(`transactions_fired_date <= $${params.length + 2}`);
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      params.push(dateFrom);
    } else if (dateTo) {
      conditions.push(`transactions_fired_date <= $${params.length + 1}`);
      params.push(dateTo);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Use DISTINCT ON (transaction_id) for deduplication with parameterized query
    const query = `
      SELECT DISTINCT ON (transaction_id) *
      FROM agent_data 
      ${whereClause}
      ORDER BY transaction_id, recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
      ${limitClause} ${offsetClause}
    `;
    
    const result = await client.query(query, params);
    
    console.log(`🔍 OPTIMIZED: Found ${result.rows.length} unique records using DISTINCT ON (transaction_id) with LIMIT`);
    return result.rows;
  } finally {
    client.release();
  }
}

// PERFORMANCE: New optimized function for statistics with agent/project filtering
export async function getAgentDataForStatistics(
  agentNames: string[],
  projectNames?: string[],
  dateFrom?: string,
  dateTo?: string,
  limit: number = 5000
): Promise<AgentData[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    const conditions = [];
    const params: any[] = [];
    
    // Agent filter with IN clause
    if (agentNames.length > 0) {
      conditions.push(`transactions_user_login = ANY($${params.length + 1})`);
      params.push(agentNames);
    }
    
    // Project filter with IN clause (if specified)
    if (projectNames && projectNames.length > 0) {
      conditions.push(`contacts_campaign_id = ANY($${params.length + 1})`);
      params.push(projectNames);
    }
    
    // Date range filter
    if (dateFrom && dateTo) {
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      conditions.push(`transactions_fired_date <= $${params.length + 2}`);
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      params.push(dateFrom);
    } else if (dateTo) {
      conditions.push(`transactions_fired_date <= $${params.length + 1}`);
      params.push(dateTo);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Use DISTINCT ON for deduplication with performance limit
    const query = `
      SELECT DISTINCT ON (transaction_id) *
      FROM agent_data 
      ${whereClause}
      ORDER BY transaction_id, recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
      LIMIT ${limit}
    `;
    
    console.log(`🚀 STATISTICS OPTIMIZED: Executing optimized query for ${agentNames.length} agents, ${projectNames?.length || 'ALL'} projects, LIMIT ${limit}`);
    const result = await client.query(query, params);
    
    console.log(`🚀 STATISTICS OPTIMIZED: Found ${result.rows.length} records in single query`);
    return result.rows;
    
  } finally {
    client.release();
  }
}

// Optimized function for specific agent and project call details
export async function getAgentCallDetails(
  agentLogin: string, 
  campaignId: string, 
  dateFrom?: string, 
  dateTo?: string,
  limit: number = 10000  // ERHÖHT: Von 500 auf 10.000 für vollständige Call Details
): Promise<AgentData[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    const conditions = [
      `transactions_user_login = $1`,
      `contacts_campaign_id = $2`
    ];
    const params: any[] = [agentLogin, campaignId];
    
    if (dateFrom && dateTo) {
      // Date range query
      conditions.push(`transactions_fired_date >= $${params.length + 1}`);
      conditions.push(`transactions_fired_date <= $${params.length + 2}`);
      params.push(dateFrom, dateTo);
    } else if (dateFrom && !dateTo) {
      // Single date query (exact match)
      conditions.push(`transactions_fired_date = $${params.length + 1}`);
      params.push(dateFrom);
    } else if (dateTo) {
      conditions.push(`transactions_fired_date <= $${params.length + 1}`);
      params.push(dateTo);
    }
    
    // Use DISTINCT ON (transaction_id) for deduplication as specified by user
    const result = await client.query(`
      SELECT DISTINCT ON (transaction_id) *
      FROM agent_data 
      WHERE ${conditions.join(' AND ')}
      ORDER BY transaction_id, recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
      LIMIT ${limit}
    `, params);
    
    console.log(`🔍 Found ${result.rows.length} unique records for agent "${agentLogin}" + campaign "${campaignId}" using DISTINCT ON (transaction_id)`);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getCampaignAgentReference(): Promise<CampaignAgentReference[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT contacts_campaign_id, transactions_user_login 
      FROM campaign_agent_reference_data 
      WHERE contacts_campaign_id IS NOT NULL 
      AND transactions_user_login IS NOT NULL
      ORDER BY transactions_user_login, contacts_campaign_id
    `);
    
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getCampaignStateReference(campaignId?: string): Promise<CampaignStateReference[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    let query = `
      SELECT DISTINCT contacts_campaign_id, transactions_status_detail, transactions_status 
      FROM campaign_state_reference_data 
      WHERE contacts_campaign_id IS NOT NULL 
      AND transactions_status_detail IS NOT NULL
      AND transactions_status IN ('declined', 'success', 'open')
    `;
    
    const params: any[] = [];
    
    if (campaignId) {
      query += ` AND contacts_campaign_id = $1`;
      params.push(campaignId);
    }
    
    query += ` ORDER BY contacts_campaign_id, transactions_status, transactions_status_detail`;
    
    console.log(`🔍 Querying campaign_state_reference_data for ${campaignId || 'all campaigns'}`);
    const result = await client.query(query, params);
    console.log(`✅ Found ${result.rows.length} campaign state references`);
    
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getOutcomeStatus(campaignId: string, outcomeDetail: string): Promise<string | null> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    const query = `
      SELECT transactions_status 
      FROM campaign_state_reference_data 
      WHERE contacts_campaign_id = $1 
      AND transactions_status_detail = $2
      LIMIT 1
    `;
    
    console.log(`🔍 Getting status for campaign ${campaignId}, outcome ${outcomeDetail}`);
    const result = await client.query(query, [campaignId, outcomeDetail]);
    
    if (result.rows.length > 0) {
      const status = result.rows[0].transactions_status;
      console.log(`✅ Found status: ${status} for ${outcomeDetail} in campaign ${campaignId}`);
      return status;
    } else {
      console.log(`❌ No status found for ${outcomeDetail} in campaign ${campaignId}`);
      return null;
    }
  } finally {
    client.release();
  }
}

export async function getAgentStats(
  agentLogin: string, 
  dateFrom?: string, 
  dateTo?: string
): Promise<AgentData[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    // Build WHERE conditions with parameterized queries
    let whereClause = `WHERE transactions_user_login = $1`;
    const params: any[] = [agentLogin];
    
    if (dateFrom && dateTo) {
      // Date range query
      whereClause += ` AND transactions_fired_date >= $${params.length + 1} AND transactions_fired_date <= $${params.length + 2}`;
      params.push(dateFrom, dateTo);
    } else if (dateFrom && !dateTo) {
      // Single date query (exact match)
      whereClause += ` AND transactions_fired_date = $${params.length + 1}`;
      params.push(dateFrom);
    } else if (dateTo) {
      whereClause += ` AND transactions_fired_date <= $${params.length + 1}`;
      params.push(dateTo);
    }
    
    // Use DISTINCT ON (transaction_id) for deduplication as specified by user
    const result = await client.query(`
      SELECT DISTINCT ON (transaction_id) *
      FROM agent_data 
      ${whereClause}
      ORDER BY transaction_id, recordings_started DESC NULLS LAST, connections_duration DESC NULLS LAST
    `, params);
    
    console.log(`🔍 Found ${result.rows.length} unique records for agent "${agentLogin}" using DISTINCT ON (transaction_id)`);
    return result.rows;
  } finally {
    client.release();
  }
}

// Direct SQL query exactly as user specified
export async function getCallDetailsDirectly(
  agentName: string = 'Ihsan.Simseker',
  campaignId: string = '3F767KEPW4V73JZS',
  date: string = '2025-09-04'
): Promise<AgentData[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    console.log(`🎯 DIRECT SQL: SELECT * FROM agent_data WHERE transactions_user_login = '${agentName}' AND transactions_fired_date = '${date}' AND contacts_campaign_id = '${campaignId}'`);
    
    const result = await client.query(`
      SELECT * FROM agent_data 
      WHERE LOWER(transactions_user_login) = LOWER($1) 
      AND transactions_fired_date = $2 
      AND contacts_campaign_id = $3
    `, [agentName, date, campaignId]);
    
    console.log(`✅ Direct SQL returned ${result.rows.length} records`);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getUniqueAgents(): Promise<string[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    console.log('🔍 Loading agents from agent_latest_last_2_months VIEW - only active agents from last 2 months');
    const result = await client.query(`
      SELECT DISTINCT transactions_user_login 
      FROM agent_latest_last_2_months 
      WHERE transactions_user_login IS NOT NULL
      AND transactions_user_login != ''
      ORDER BY transactions_user_login
    `);
    
    console.log(`✅ Found ${result.rows.length} active agents from last 2 months`);
    
    // Deduplicate agents with different case variations
    // Keep only proper case: First letter uppercase, first letter after dot uppercase
    const agents = result.rows.map(row => row.transactions_user_login);
    const deduplicatedAgents = new Map<string, string>();
    
    for (const agent of agents) {
      const lowerKey = agent.toLowerCase();
      
      // Check if we already have this agent (case-insensitive)
      if (!deduplicatedAgents.has(lowerKey)) {
        deduplicatedAgents.set(lowerKey, agent);
      } else {
        // We have a duplicate - keep the one with proper case
        const existing = deduplicatedAgents.get(lowerKey)!;
        const proper = getProperCaseAgent(agent);
        const existingProper = getProperCaseAgent(existing);
        
        // If current agent has proper case, replace the existing one
        if (agent === proper && existing !== existingProper) {
          deduplicatedAgents.set(lowerKey, agent);
        }
      }
    }
    
    const finalAgents = Array.from(deduplicatedAgents.values()).sort();
    console.log(`🔧 Deduplicated ${agents.length} agents to ${finalAgents.length} (removed case duplicates)`);
    
    return finalAgents;
  } finally {
    client.release();
  }
}

// Helper function to convert agent name to proper case
function getProperCaseAgent(name: string): string {
  const parts = name.split('.');
  return parts.map(part => 
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join('.');
}

export async function getUniqueCampaigns(): Promise<string[]> {
  checkExternalDb();
  const client = await externalPool!.connect();
  try {
    console.log('🔍 Loading campaigns for active agents from last 2 months');
    
    // Get campaigns from agent_data for recent data (last 3 months to be safe)
    const result = await client.query(`
      SELECT DISTINCT contacts_campaign_id 
      FROM agent_data
      WHERE contacts_campaign_id IS NOT NULL
      AND contacts_campaign_id != ''
      AND transactions_fired_date >= '2025-06-01'
      ORDER BY contacts_campaign_id
      LIMIT 150
    `);
    
    console.log(`✅ Found ${result.rows.length} campaigns with active agents from last 2 months`);
    return result.rows.map(row => row.contacts_campaign_id);
  } finally {
    client.release();
  }
}