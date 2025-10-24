/*
  Standalone verifier for Google Sheets campaign data.
  Usage:
    - Ensure env var GOOGLE_SHEETS_ID is set (and optional tab overrides)
    - Run:  npx tsx tools/verify-sheets.ts
    - Or via npm script: npm run verify:sheets
*/

import 'dotenv/config'

async function main() {
  const sheetId = process.env.GOOGLE_SHEETS_ID
  if (!sheetId) {
    console.error('GOOGLE_SHEETS_ID is not set. Please add it to your .env')
    process.exit(1)
  }

  const { getSheetCampaignsFull, getSheetCampaignMapping, getSheetTabRaw } = await import('../server/google-sheets')

  console.log('Reading Google Sheet…')
  console.log('Sheet ID:', sheetId)
  console.log('Tabs:', {
    NEW: process.env.GOOGLE_SHEETS_TAB_NEW || 'campaigns_new',
    ACTIVE: process.env.GOOGLE_SHEETS_TAB_ACTIVE || 'campaigns_active',
    ARCHIVED: process.env.GOOGLE_SHEETS_TAB_ARCHIVED || 'campaigns_archived',
  })

  const [rows, mapping] = await Promise.all([
    getSheetCampaignsFull(),
    getSheetCampaignMapping(),
  ])

  console.log('\n=== Summary ===')
  console.log('Total unique campaigns:', rows.length)
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    const s = (r.status || 'unknown').toLowerCase()
    byStatus[s] = (byStatus[s] || 0) + 1
  }
  console.table(byStatus)

  console.log('\n=== Samples (first 5) ===')
  console.table(rows.slice(0, 5))

  // Check mapping coverage vs rows
  const missingInMapping = rows.filter(r => !mapping[r.campaign_id])
  if (missingInMapping.length > 0) {
    console.log(`\nWARNING: ${missingInMapping.length} campaign_id entries missing in name mapping`) 
    console.table(missingInMapping.slice(0, 5))
  } else {
    console.log('\nAll campaign_ids have friendly names in mapping ✅')
  }

  // Detect duplicates by name pointing to multiple ids
  const idsByName = new Map<string, Set<string>>()
  for (const r of rows) {
    const name = (r.campaign || '').trim()
    if (!name) continue
    if (!idsByName.has(name)) idsByName.set(name, new Set())
    idsByName.get(name)!.add(r.campaign_id)
  }
  const nameDupes = Array.from(idsByName.entries()).filter(([, set]) => set.size > 1)
  if (nameDupes.length > 0) {
    console.log(`\nNOTE: ${nameDupes.length} campaign names map to multiple ids`)
    console.log('Example:')
    for (const [name, set] of nameDupes.slice(0, 3)) {
      console.log(' -', name, '->', Array.from(set).join(', '))
    }
  }

  // Optionally dump JSON (flag --json)
  if (process.argv.includes('--json')) {
    console.log('\n=== JSON rows ===')
    console.log(JSON.stringify(rows, null, 2))
  }

  // Per-tab diagnostics: headers + 3 sample rows
  const tabs = {
    NEW: process.env.GOOGLE_SHEETS_TAB_NEW || 'campaigns_new',
    ACTIVE: process.env.GOOGLE_SHEETS_TAB_ACTIVE || 'campaigns_active',
    ARCHIVED: process.env.GOOGLE_SHEETS_TAB_ARCHIVED || 'campaigns_archived',
  }
  for (const [label, tab] of Object.entries(tabs)) {
    const raw = await getSheetTabRaw(tab)
    console.log(`\n=== Tab: ${label} (${tab}) ===`)
    console.log('Headers:')
    console.log(raw.headers)
    if (raw.rows.length > 0) {
      console.log('Samples:')
      console.table(raw.rows.slice(0, 3))

      // Normalized preview
      const headersLower = raw.headers.map(h => (h || '').toString().trim().toLowerCase())
      const idx = (name: string) => headersLower.indexOf(name)
      const iCampaign = idx('campaign')
      const iCampaignId = idx('campaign_id')
      const iCompany = idx('company')
      const iTimeCategory = idx('time_category')
      const iTarget = idx('target')
      const iDialfirePhone = idx('dialfire_phone')
      const iDbSync = idx('dbsync_id')
      const iStatus = idx('status')
      const iAufnahme = headersLower.findIndex(h => h.includes('aufnahme'))

      const normalized = raw.rows.slice(0, 3).map((r) => ({
        sourceTab: label,
        status: (iStatus >= 0 ? r[iStatus] : (label.toLowerCase())).toString(),
        campaign: iCampaign >= 0 ? r[iCampaign] : '',
        campaign_id: iCampaignId >= 0 ? r[iCampaignId] : '',
        company: iCompany >= 0 ? r[iCompany] : undefined,
        time_category: iTimeCategory >= 0 ? r[iTimeCategory] : undefined,
        target: iTarget >= 0 ? r[iTarget] : undefined,
        dialfire_phone: iDialfirePhone >= 0 ? r[iDialfirePhone] : undefined,
        dbsync_id: iDbSync >= 0 ? r[iDbSync] : undefined,
        aufnahme_call: iAufnahme >= 0 ? r[iAufnahme] : undefined,
      }))

      console.log('Normalized (first 3):')
      console.table(normalized)
    } else {
      console.log('No rows found')
    }
  }

  // Basic sanity check: warn if ACTIVE/ARCHIVED envs look swapped
  const activeRaw = await getSheetTabRaw(tabs.ACTIVE)
  const archivedRaw = await getSheetTabRaw(tabs.ARCHIVED)
  const activeHasCompany = activeRaw.headers.map(h => (h||'').toLowerCase()).includes('company')
  const archivedHasCompany = archivedRaw.headers.map(h => (h||'').toLowerCase()).includes('company')
  const activeHasStatusOnly = activeRaw.headers.map(h => (h||'').toLowerCase()).includes('status') && !activeHasCompany
  const archivedHasStatusOnly = archivedRaw.headers.map(h => (h||'').toLowerCase()).includes('status') && !archivedHasCompany

  if (activeHasCompany && archivedHasStatusOnly) {
    console.log('\nLooks correct: ACTIVE tab has detailed fields, ARCHIVED is status-only. ✅')
  } else if (archivedHasCompany && activeHasStatusOnly) {
    console.log('\nWARNING: ACTIVE and ARCHIVED tabs may be swapped in env. Consider setting:')
    console.log('  GOOGLE_SHEETS_TAB_ACTIVE=campaigns_active')
    console.log('  GOOGLE_SHEETS_TAB_ARCHIVED=campaigns_archived')
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Verifier failed:', err)
  process.exit(1)
})


