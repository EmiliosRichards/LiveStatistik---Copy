'use client'

import { useState, useEffect, useRef } from 'react'
import { HelpCircle, Bell, User, ChevronDown } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function DashboardHeader() {
  const { language, setLanguage, t } = useLanguage()
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const helpButtonRef = useRef<HTMLButtonElement>(null)
  const notificationButtonRef = useRef<HTMLButtonElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const notificationDropdownRef = useRef<HTMLDivElement>(null)
  const profileDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdowns/modals when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node

      // Check if click is outside notification dropdown
      if (
        showNotifications &&
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(target) &&
        notificationButtonRef.current &&
        !notificationButtonRef.current.contains(target)
      ) {
        setShowNotifications(false)
      }

      // Check if click is outside profile dropdown
      if (
        showProfileMenu &&
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(target) &&
        profileButtonRef.current &&
        !profileButtonRef.current.contains(target)
      ) {
        setShowProfileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showNotifications, showProfileMenu])

  // Toggle functions that close other dropdowns/modals
  const toggleHelp = () => {
    setShowNotifications(false)
    setShowProfileMenu(false)
    setShowHelpModal(prev => !prev)
  }

  const toggleNotifications = () => {
    setShowHelpModal(false)
    setShowProfileMenu(false)
    setShowNotifications(prev => !prev)
  }

  const toggleProfile = () => {
    setShowHelpModal(false)
    setShowNotifications(false)
    setShowProfileMenu(prev => !prev)
  }

  return (
    <>
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <a href="/dashboard" className="inline-flex items-center" aria-label="Manuav Internal App">
                <img src="/Manuav-web-site-LOGO.png" alt="Manuav" className="h-8 w-auto invert" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              ref={helpButtonRef}
              aria-label={t('header.help')} 
              onClick={toggleHelp} 
              className="p-2 rounded hover:bg-slate-100"
            >
              <HelpCircle className="w-5 h-5 text-slate-700" />
            </button>
            
            {/* Notification Dropdown */}
            <div className="relative">
              <button 
                ref={notificationButtonRef}
                aria-label={t('header.notifications')} 
                onClick={toggleNotifications} 
                className="relative p-2 rounded hover:bg-slate-100"
              >
                <Bell className="w-5 h-5 text-slate-700" />
                <span className="absolute -top-0.5 -right-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-red-500 text-white">1</span>
              </button>
              
              {showNotifications && (
                <div 
                  ref={notificationDropdownRef}
                  className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50"
                >
                  <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">{t('header.notifications')}</h3>
                    <button className="text-xs text-slate-500 hover:text-slate-700">{t('header.markAsRead')}</button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-slate-100 hover:bg-slate-50">
                      <div className="flex gap-3">
                        <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-800 text-sm mb-1">📢 {t('header.newFeature')}: {t('header.multiAgentView')}</h4>
                          <p className="text-xs text-slate-600 mb-2">{t('header.multiAgentDesc')}</p>
                          <p className="text-xs text-slate-400">{language === 'de' ? 'Okt' : 'Oct'} 27, 2025</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200 mx-1" />
            
            {/* Profile Menu */}
            <div className="relative">
              <button 
                ref={profileButtonRef}
                aria-label={t('header.account')} 
                onClick={toggleProfile}
                className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100"
              >
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
                <span className="hidden sm:inline text-sm text-slate-700">Emilios</span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </button>

              {showProfileMenu && (
                <div 
                  ref={profileDropdownRef}
                  className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50"
                >
                  <div className="px-4 py-3 border-b border-slate-200">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t('header.currentAccount')}</p>
                    <p className="font-semibold text-slate-800">Emilios Richards</p>
                    <p className="text-sm text-slate-600">{t('header.member')}</p>
                  </div>

                  <div className="py-2">
                    <button 
                      disabled
                      className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-slate-400 cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm">{t('header.accountSettings')}</span>
                    </button>

                    <button 
                      disabled
                      className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-slate-400 cursor-not-allowed border-t border-slate-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span className="text-sm">{t('header.signOut')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button 
              onClick={() => setLanguage('de')}
              className={`text-sm transition-colors ${language === 'de' ? 'text-blue-600 font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              DE
            </button>
            <span className="text-slate-300">|</span>
            <button 
              onClick={() => setLanguage('en')}
              className={`text-sm transition-colors ${language === 'en' ? 'text-blue-600 font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50 p-4" onClick={() => setShowHelpModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-800">{t('help.title')}</h2>
              <button onClick={() => setShowHelpModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              <p className="text-slate-600 text-center mb-8">
                {t('help.description')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border-2 border-slate-200 rounded-lg p-6 hover:border-blue-400 transition-colors">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                      <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-3">{t('help.supportTicket')}</h3>
                    <p className="text-slate-600 text-sm mb-6">
                      {t('help.supportTicketDesc')}
                    </p>
                    <button className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                      {t('help.createTicket')}
                    </button>
                    <button className="text-blue-600 text-sm mt-3 hover:underline">
                      {t('help.pastTickets')}
                    </button>
                  </div>
                </div>

                <div className="border-2 border-slate-200 rounded-lg p-6 hover:border-blue-400 transition-colors">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                      <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-3">{t('help.knowledgeBase')}</h3>
                    <p className="text-slate-600 text-sm mb-6">
                      {t('help.knowledgeBaseDesc')}
                    </p>
                    <button className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium mb-2 w-full">
                      {t('help.documentation')}
                    </button>
                    <button className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium w-full">
                      {t('help.videos')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
