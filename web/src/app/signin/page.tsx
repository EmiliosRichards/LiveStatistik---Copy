'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { User, Lock, ArrowRight } from 'lucide-react'
import Image from 'next/image'

// Use build-time public env only to avoid SSR/CSR mismatches
const ALLOW_GUEST_UI = process.env.NEXT_PUBLIC_ALLOW_GUEST === 'true'

export default function SignIn() {
  const [loading, setLoading] = useState<null|'ms'|'guest'>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <Image 
              src="/Manuav-web-site-LOGO.png" 
              alt="Manuav" 
              width={150}
              height={48}
              style={{ height: 'auto', width: 'auto', maxHeight: '48px', filter: 'invert(1)' }}
              priority
              unoptimized
            />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h1>
          <p className="text-slate-600">Sign in to access your dashboard</p>
        </div>

        {/* Sign-in Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Email and Password Fields */}
          <div className="space-y-4 mb-6" suppressHydrationWarning>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
              <div className="relative" suppressHydrationWarning>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-email"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <div className="relative" suppressHydrationWarning>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-password"
                />
              </div>
            </div>
          </div>

          {/* Sign-in Buttons */}
          <div className="space-y-3">
            <div className="relative group">
              <button
                onClick={() => { /* Disabled for now */ }}
                disabled={true}
                className="w-full flex items-center justify-center gap-3 bg-blue-300 text-white font-medium px-6 py-3 rounded-lg cursor-not-allowed opacity-60 relative"
                data-testid="button-signin-microsoft"
                title="Microsoft login temporarily disabled"
              >
                <>
                  <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 0H0V11H11V0Z" fill="currentColor"/>
                    <path d="M23 0H12V11H23V0Z" fill="currentColor"/>
                    <path d="M11 12H0V23H11V12Z" fill="currentColor"/>
                    <path d="M23 12H12V23H23V12Z" fill="currentColor"/>
                  </svg>
                  <span>Continue with Microsoft</span>
                  <svg className="w-5 h-5 ml-auto" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </>
              </button>
              {/* Tooltip on hover */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-12 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                Microsoft login temporarily unavailable
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
              </div>
            </div>

            {ALLOW_GUEST_UI && (
              <button
                onClick={() => { setLoading('guest'); signIn('credentials', { username:'guest', password:'guest', callbackUrl: '/dashboard' }) }}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 disabled:bg-slate-100 text-slate-700 font-medium px-6 py-3 rounded-lg transition-colors border-2 border-slate-200 hover:border-slate-300"
                data-testid="button-signin-guest"
              >
                {loading === 'guest' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <User className="w-5 h-5" />
                    <span>Continue as Guest</span>
                    <ArrowRight className="w-5 h-5 ml-auto" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Helper Text */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-500 text-center">
              Use your Microsoft account to access the dashboard
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            Secure authentication powered by <span className="font-semibold">Azure AD</span>
          </p>
        </div>
      </div>
    </div>
  )
}
