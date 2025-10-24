'use client'

import { useEffect, useState } from 'react'

export default function ThemeSwitch() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark'
    setIsDark(current)
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    if (next) document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }

  return (
    <button
      onClick={toggle}
      className={`px-2 py-1 rounded-md border border-border text-sm ${isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'} hover:bg-bg-elevated`}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? 'Dark' : 'Light'}
    </button>
  )
}


