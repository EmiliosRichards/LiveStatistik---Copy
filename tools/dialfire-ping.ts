import 'dotenv/config'

// Simple Dialfire API connectivity check
// Usage:
//   DIALFIRE_API_TOKEN=... [DIALFIRE_TENANT=9c6d0163] npm run dialfire:ping

const token = process.env.DIALFIRE_API_TOKEN || ''
const tenant = process.env.DIALFIRE_TENANT || '9c6d0163'

async function run() {
  if (!token) {
    console.error('❌ DIALFIRE_API_TOKEN is not set. Set it in your env and retry.')
    process.exit(1)
  }
  const base = `https://api.dialfire.com/v2/tenants/${tenant}`
  console.log(`🔐 Using tenant=${tenant}`)

  const headers = { Authorization: `Bearer ${token}` }
  const url = `${base}/campaigns`
  console.log(`🔎 GET ${url}`)

  const res = await fetch(url, { headers })
  if (!res.ok) {
    console.error(`❌ Dialfire API error: ${res.status} ${res.statusText}`)
    const text = await res.text().catch(() => '')
    if (text) console.error(text.slice(0, 500))
    process.exit(1)
  }
  const data = (await res.json()) as Array<{ id: string; title: string }>
  console.log(`✅ Connected. Campaigns: ${data.length}`)
  for (const c of data.slice(0, 10)) {
    console.log(`  - ${c.id} | ${c.title}`)
  }
  if (data.length > 10) console.log(`  ... and ${data.length - 10} more`)
}

run().catch(err => {
  console.error('❌ Failed:', err?.message || err)
  process.exit(1)
})


