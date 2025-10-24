'use client'

import { useState } from 'react'

const swatches = [
  { name: 'bg', var: 'var(--color-bg)' },
  { name: 'bg-elevated', var: 'var(--color-bg-elevated)' },
  { name: 'text', var: 'var(--color-text)' },
  { name: 'text-muted', var: 'var(--color-text-muted)' },
  { name: 'accent', var: 'var(--color-accent)' },
  { name: 'danger', var: 'var(--color-danger)' },
  { name: 'success', var: 'var(--color-success)' },
  { name: 'border', var: 'var(--color-border)' },
]

export default function TokensGallery() {
  const [theme, setTheme] = useState<'light'|'dark'>('light')

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : '')
    }
  }

  return (
    <main className="min-h-screen bg-bg text-text">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Design Tokens</h1>
          <button onClick={toggleTheme} className="px-3 py-1.5 rounded-md border border-border bg-bg-elevated text-text hover:bg-bg">
            Toggle {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Colors</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {swatches.map(s => (
              <div key={s.name} className="border border-border rounded-lg overflow-hidden">
                <div style={{ background: s.var, height: 56 }} />
                <div className="p-2 text-sm">
                  <div className="font-medium">{s.name}</div>
                  <code className="text-text-muted">{s.var}</code>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Typography</h2>
          <div className="space-y-2">
            <p className="text-xs">Text XS • line-tight</p>
            <p className="text-sm">Text SM • line-normal</p>
            <p className="text-base">Text Base • line-normal</p>
            <p className="text-lg">Text LG • line-relaxed</p>
            <p className="text-xl">Text XL • line-relaxed</p>
            <p className="text-text-muted">Muted text</p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-accent text-bg hover:opacity-95">Primary</button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-bg-elevated text-text hover:bg-bg">Secondary</button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-danger">Danger</button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-text">Pill</button>
          </div>
        </section>
      </div>
    </main>
  )
}


