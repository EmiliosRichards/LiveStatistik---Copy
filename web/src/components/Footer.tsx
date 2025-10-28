'use client'

import { useLanguage } from '@/contexts/LanguageContext'

export function Footer() {
  const { t } = useLanguage()

  return (
    <footer className="bg-white border-t border-slate-200">
      <div className="w-full px-6 py-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-slate-600">{t('footer.database')}: {t('footer.connected')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-slate-600">{t('footer.dialfire')}: {t('footer.connected')}</span>
            </div>
          </div>
          <span className="text-slate-400">{t('footer.version')} • {t('footer.internalPreview')}</span>
        </div>
      </div>
    </footer>
  )
}
