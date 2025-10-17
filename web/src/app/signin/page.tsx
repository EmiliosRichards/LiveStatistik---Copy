'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'

// Use build-time public env only to avoid SSR/CSR mismatches
const ALLOW_GUEST_UI = process.env.NEXT_PUBLIC_ALLOW_GUEST === 'true'

export default function SignIn() {
  const [loading, setLoading] = useState<null|'ms'|'guest'>(null)

  return (
    <main className="min-h-screen grid md:grid-cols-2 bg-neutral-900 text-white">
      {/* Left: form */}
      <section className="p-8 md:p-16 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">Log in</h1>
          <p className="text-sm text-white/60">Sign in to continue</p>
        </div>

        {/* Visual email/password fields (per inspo) */}
        <div className="space-y-4 max-w-md">
          <div>
            <label className="text-xs uppercase tracking-wider text-white/60">Email</label>
            <div className="mt-1 rounded border border-white/15 bg-white/5 px-3 py-2">your@email.com</div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-white/60">Password</label>
            <div className="mt-1 rounded border border-white/15 bg-white/5 px-3 py-2">••••••••</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading('ms'); signIn('azure-ad', { callbackUrl: '/' }) }}
            className="rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium"
          >
            {loading==='ms' ? 'Redirecting…' : 'Continue with Microsoft'}
          </button>
          {ALLOW_GUEST_UI && (
            <button
              onClick={() => { setLoading('guest'); signIn('credentials', { username:'guest', password:'guest', callbackUrl: '/' }) }}
              className="rounded border border-white/20 hover:bg-white/10 px-4 py-2 text-sm"
            >
              {loading==='guest' ? 'Signing in…' : 'Continue as guest'}
            </button>
          )}
        </div>

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-white/70">
            <span className='inline-block h-2 w-2 rounded-full bg-white animate-pulse'></span>
            <span className='inline-block h-2 w-2 rounded-full bg-white/80 animate-pulse [animation-delay:150ms]'></span>
            <span className='inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse [animation-delay:300ms]'></span>
            <span className="ml-2">Please wait…</span>
          </div>
        )}
      </section>

      {/* Right: decorative panel per inspo */}
      <aside className="hidden md:flex items-center justify-center bg-gradient-to-br from-blue-500/30 to-purple-500/20">
        <div className="h-24 w-24 rounded-full bg-white/10 animate-pulse"></div>
      </aside>
    </main>
  )
}


