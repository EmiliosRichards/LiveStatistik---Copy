import dotenv from "dotenv";
dotenv.config();

// Lightweight Google Sheets fetcher using public CSV export.
// Requires the sheet to be viewable by link or published to web.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: { mapping: Record<string, string>; ts: number } | null = null;
let cacheFull: { rows: CampaignRow[]; ts: number } | null = null;

type CampaignRow = {
  campaign: string;
  campaign_id: string;
  status?: string;
};

/** Parse a minimal CSV string into rows of string arrays. Handles quoted fields. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ""; }
      else if (ch === '\n' || ch === '\r') {
        // finalize row on first line break
        if (ch === '\r' && csv[i + 1] === '\n') i++; // handle CRLF
        current.push(field); field = "";
        if (current.length > 1 || current[0] !== "") rows.push(current);
        current = [];
      } else { field += ch; }
    }
  }
  // push last field
  if (field.length > 0 || current.length > 0) { current.push(field); rows.push(current); }
  return rows;
}

async function fetchCsvForTab(sheetId: string, tabName: string): Promise<CampaignRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const iCampaign = header.indexOf("campaign");
  const iCampaignId = header.indexOf("campaign_id");
  const iStatus = header.indexOf("status");
  if (iCampaign === -1 || iCampaignId === -1) return [];
  const out: CampaignRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const campaign = (row[iCampaign] || "").trim();
    const campaign_id = (row[iCampaignId] || "").trim();
    const status = iStatus >= 0 ? (row[iStatus] || "").trim() : undefined;
    if (!campaign || !campaign_id) continue;
    out.push({ campaign, campaign_id, status });
  }
  return out;
}

/** Return raw headers and rows for a specific tab (for diagnostics). */
export async function getSheetTabRaw(tabName: string): Promise<{ headers: string[]; rows: string[][] }> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) return { headers: [], rows: [] };
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  if (!res.ok) return { headers: [], rows: [] };
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...dataRows] = rows;
  return { headers: headerRow, rows: dataRows };
}

/**
 * Read campaign mapping from Google Sheets tabs.
 * Returns mapping of campaign_id -> human-readable campaign name.
 */
export async function getSheetCampaignMapping(): Promise<Record<string, string>> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) return {};

  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.mapping;

  const tabActive = process.env.GOOGLE_SHEETS_TAB_ACTIVE || "campaigns_active";
  const tabNew = process.env.GOOGLE_SHEETS_TAB_NEW || "campaigns_new";
  const tabArchived = process.env.GOOGLE_SHEETS_TAB_ARCHIVED || "campaigns_archived";

  try {
    const [activeRows, newRows, archivedRows] = await Promise.all([
      fetchCsvForTab(sheetId, tabActive),
      fetchCsvForTab(sheetId, tabNew),
      fetchCsvForTab(sheetId, tabArchived)
    ]);

    const mapping: Record<string, string> = {};
    for (const r of [...activeRows, ...newRows, ...archivedRows]) {
      if (r.campaign_id && r.campaign) mapping[r.campaign_id] = r.campaign;
    }
    cache = { mapping, ts: now };
    return mapping;
  } catch (e) {
    console.error("❌ Failed to fetch Google Sheet mapping:", e);
    return {};
  }
}

export async function getSheetCampaignsFull(): Promise<CampaignRow[]> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) return [];

  const now = Date.now();
  if (cacheFull && now - cacheFull.ts < CACHE_TTL_MS) return cacheFull.rows;

  const tabActive = process.env.GOOGLE_SHEETS_TAB_ACTIVE || "campaigns_active";
  const tabNew = process.env.GOOGLE_SHEETS_TAB_NEW || "campaigns_new";
  const tabArchived = process.env.GOOGLE_SHEETS_TAB_ARCHIVED || "campaigns_archived";

  const [activeRows, newRows, archivedRows] = await Promise.all([
    fetchCsvForTab(sheetId, tabActive),
    fetchCsvForTab(sheetId, tabNew),
    fetchCsvForTab(sheetId, tabArchived)
  ]);

  // Always set status based on tab (treat NEW as "new" even if sheet says "active")
  const mark = (rows: CampaignRow[], status: string) => rows.map(r => ({ ...r, status }));
  const merged = [
    ...mark(activeRows, 'active'),
    ...mark(newRows, 'new'),
    ...mark(archivedRows, 'archived')
  ];

  // Deduplicate by campaign_id, prefer new > active > archived
  const priority: Record<string, number> = { new: 3, active: 2, archived: 1 };
  const byId = new Map<string, CampaignRow>();
  for (const row of merged) {
    if (!row.campaign_id) continue;
    const prev = byId.get(row.campaign_id);
    if (!prev || (priority[row.status || ''] ?? 0) > (priority[prev.status || ''] ?? 0)) {
      byId.set(row.campaign_id, row);
    }
  }

  const rows = Array.from(byId.values());
  cacheFull = { rows, ts: now };
  return rows;
}


