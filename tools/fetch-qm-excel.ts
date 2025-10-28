/**
 * Quick ad-hoc tool to fetch the QM Excel from SharePoint and print sheet metadata
 * and selected columns as JSON. Run:
 *   npx tsx tools/fetch-qm-excel.ts "<public-or-shared-link>"
 *
 * Notes:
 * - For public/shared links that download directly, this will stream the .xlsx
 * - For links that require auth, set SHAREPOINT_COOKIE env with a valid cookie
 *   (e.g., "FedAuth=...; rtFa=..."), or place a direct download URL.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'
import { parse as parseUrl } from 'url'
import * as XLSX from 'xlsx'

function downloadFile(url: string, headers: Record<string,string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `qm_${Date.now()}.xlsx`)
    const u = parseUrl(url)
    const mod = (u.protocol === 'https:' ? https : http)
    const req = mod.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect once
        return resolve(downloadFile(res.headers.location, headers))
      }
      if ((res.statusCode || 0) >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const out = fs.createWriteStream(tmp)
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(tmp)))
    })
    req.on('error', reject)
  })
}

type Row = Record<string, any>

async function main() {
  const link = process.argv[2]
  if (!link) {
    console.error('Usage: tsx tools/fetch-qm-excel.ts <sharepoint-link-or-local-path>')
    process.exit(1)
  }

  const cookie = process.env.SHAREPOINT_COOKIE || ''
  let filePath = link
  if (!fs.existsSync(link)) {
    console.log('➡️ Fetching Excel…')
    filePath = await downloadFile(link, cookie ? { Cookie: cookie } : {})
    console.log('✅ Downloaded to', filePath)
  } else {
    console.log('📄 Using local file', filePath)
  }

  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' })
  const sheetNames = wb.SheetNames
  console.log('📄 Sheets:', sheetNames)

  // Heuristic: pick most recent sheet (last by name) if multiple like "Abschlüsse 10.2025"
  const targetName = sheetNames.find(s => /absch|abschluss|abschlüsse/i.test(s)) || sheetNames[sheetNames.length - 1]
  if (!targetName) {
    console.log('⚠️ No sheets found')
    return
  }
  const ws = wb.Sheets[targetName]
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: null })

  // Try to normalize some likely column names for QM
  // These will guide building the dashboard table later
  const guess = (row: Row, keys: string[]): any => {
    for (const k of Object.keys(row)) {
      const norm = k.toLowerCase().replace(/\s+/g,'')
      if (keys.some(w => norm.includes(w))) return row[k]
    }
    return null
  }

  const sample = rows.slice(0, 50).map((r) => ({
    agent: guess(r, ['agent','name','mitarbeiter','login']),
    campaign: guess(r, ['projekt','campaign','kampagne']),
    date: guess(r, ['datum','date','woche','kw']),
    target: guess(r, ['ziel','soll','target']),
    achieved: guess(r, ['ist','erfolg','abschl','positiv']),
    reachRate: guess(r, ['reach','erreich','kontakt']),
    conversion: guess(r, ['conv','quote','erfolgsquote']),
    talkTimeMin: guess(r, ['gz','gespraech','talk']),
    workTimeH: guess(r, ['az','arbeitszeit']),
    raw: r
  }))

  const out = {
    sheet: targetName,
    totalRows: rows.length,
    columns: Object.keys(rows[0] || {}),
    sample
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(err => {
  console.error('❌ Tool failed:', err?.message || err)
  process.exit(1)
})


