'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export interface InlineCalendarProps {
  value: Date | null
  onChange: (date: Date) => void
  visibleMonth: number // 0-11
  visibleYear: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
}


function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function startWeekday(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  // Make week start on Monday (Mon=0 ... Sun=6)
  return (d + 6) % 7
}

export function InlineCalendar({ value, onChange, visibleMonth, visibleYear, onMonthChange, onYearChange }: InlineCalendarProps) {
  const { t } = useLanguage()
  
  const monthNames = [
    t('months.january'), t('months.february'), t('months.march'), t('months.april'), 
    t('months.may'), t('months.june'), t('months.july'), t('months.august'),
    t('months.september'), t('months.october'), t('months.november'), t('months.december')
  ]

  const days = useMemo(() => {
    const leading = startWeekday(visibleYear, visibleMonth)
    const total = getDaysInMonth(visibleYear, visibleMonth)
    const items: Array<{ day: number | null; date?: Date }> = []

    for (let i = 0; i < leading; i++) items.push({ day: null })
    for (let d = 1; d <= total; d++) {
      const date = new Date(visibleYear, visibleMonth, d)
      items.push({ day: d, date })
    }
    return items
  }, [visibleMonth, visibleYear])

  const selectedKey = value ? value.toDateString() : null

  const years = useMemo(() => {
    const current = new Date().getFullYear()
    const start = current - 9
    const arr: number[] = []
    for (let y = start; y <= current; y++) arr.push(y)
    return arr
  }, [])

  const goPrev = () => {
    const m = visibleMonth - 1
    if (m < 0) {
      onYearChange(visibleYear - 1)
      onMonthChange(11)
    } else {
      onMonthChange(m)
    }
  }

  const goNext = () => {
    const m = visibleMonth + 1
    if (m > 11) {
      onYearChange(visibleYear + 1)
      onMonthChange(0)
    } else {
      onMonthChange(m)
    }
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 shadow-sm bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button aria-label="Previous month" className="p-2 rounded-lg hover:bg-slate-50" onClick={goPrev}>
          <ChevronLeft className="w-5 h-5 text-slate-700" />
        </button>
        <div className="flex items-center gap-2">
          <select
            className="text-slate-900 font-semibold bg-transparent px-2 py-1 rounded hover:bg-slate-50"
            value={visibleMonth}
            onChange={(e) => onMonthChange(parseInt(e.target.value))}
          >
            {monthNames.map((m, idx) => (
              <option key={m} value={idx}>{m}</option>
            ))}
          </select>
          <select
            className="text-slate-900 font-semibold bg-transparent px-2 py-1 rounded hover:bg-slate-50"
            value={visibleYear}
            onChange={(e) => onYearChange(parseInt(e.target.value))}
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button aria-label="Next month" className="p-2 rounded-lg hover:bg-slate-50" onClick={goNext}>
          <ChevronRight className="w-5 h-5 text-slate-700" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-slate-500 text-xs font-medium mb-1">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((item, idx) => {
          if (item.day === null) return <div key={`e-${idx}`} />
          const isSelected = selectedKey === item.date!.toDateString()
          return (
            <button
              key={item.day}
              className={`py-2 rounded-lg text-sm tabular-nums transition-colors ${
                isSelected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-800'
              }`}
              onClick={() => onChange(item.date!)}
            >
              {item.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}


