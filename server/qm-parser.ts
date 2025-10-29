import * as XLSX from 'xlsx';
import type { QmRow, QmDailyCell } from '@shared/schema';
import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import os from 'os';

/**
 * Download a file from a URL
 */
async function downloadFile(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `qm_${Date.now()}.xlsx`);
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, headers));
      }
      if ((res.statusCode || 0) >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(tmp)));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

/**
 * Parse a value as either numeric or code
 */
function parseCell(val: any): { value?: number; code?: string } {
  if (val === null || val === undefined || val === '') {
    return {};
  }
  if (typeof val === 'number') {
    return { value: val };
  }
  const str = String(val).trim();
  const num = parseFloat(str);
  if (!isNaN(num)) {
    return { value: num };
  }
  return { code: str };
}

/**
 * Normalize Excel row to QmRow format
 */
function normalizeRow(row: any, sheetName: string): QmRow | null {
  const projekt = row['Projekt'] || row['projekt'];
  const agent = row['Agent'] || row['agent'];
  
  if (!projekt && !agent) {
    return null;
  }

  const targetSoll = parseFloat(row['Soll'] || row['soll']) || null;
  const perfScore = parseFloat(row['Perf'] || row['perf']) || null;
  const notes = row['Notizen'] || row['notizen'] || null;
  
  let attainmentProvided: number | null = null;
  if (row[' '] !== undefined && row[' '] !== null) {
    const val = parseFloat(row[' ']);
    if (!isNaN(val)) attainmentProvided = val;
  }

  const daily: QmDailyCell[] = [];
  let achievedSum = 0;

  for (let day = 1; day <= 31; day++) {
    const cellVal = row[String(day)];
    const parsed = parseCell(cellVal);
    daily.push({ day, ...parsed });
    
    if (parsed.value !== undefined) {
      achievedSum += parsed.value;
    }
  }

  return {
    sheet: sheetName,
    projectName: projekt || '',
    agentName: agent || '',
    targetSoll,
    perfScore,
    attainmentProvided,
    achievedSum,
    notes,
    daily,
  };
}

/**
 * Parse QM Excel file and return normalized rows
 */
export async function parseQmExcel(
  source: string,
  options: { month?: string; sheet?: string; cookie?: string } = {}
): Promise<QmRow[]> {
  let filePath = source;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const headers: Record<string, string> = {};
    if (options.cookie) {
      headers.Cookie = options.cookie;
    }
    filePath = await downloadFile(source, headers);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`QM file not found: ${filePath}`);
  }

  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  const sheetNames = wb.SheetNames;

  let targetSheet: string | undefined;

  if (options.sheet) {
    targetSheet = sheetNames.find((s: string) => s === options.sheet);
  } else if (options.month) {
    const [year, monthNum] = options.month.split('-');
    const pattern = `Abschlüsse ${monthNum}.${year}`;
    targetSheet = sheetNames.find((s: string) => s === pattern || s.includes(pattern));
  }

  if (!targetSheet) {
    targetSheet = sheetNames.find((s: string) => /absch|abschluss|abschlüsse/i.test(s));
  }

  if (!targetSheet) {
    targetSheet = sheetNames[sheetNames.length - 1];
  }

  if (!targetSheet) {
    throw new Error('No suitable QM sheet found in workbook');
  }

  const ws = wb.Sheets[targetSheet];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  const normalized: QmRow[] = [];
  for (const row of rows) {
    const qmRow = normalizeRow(row, targetSheet);
    if (qmRow && (qmRow.projectName || qmRow.agentName)) {
      normalized.push(qmRow);
    }
  }

  return normalized;
}
