import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return NextResponse.next()
  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of values) response.cookies.set(name, value, { ...options, httpOnly: true, secure: process.env.VERCEL === '1' })
      },
    },
  })
  if (request.cookies.getAll().some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))) {
    await supabase.auth.getClaims()
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = { matcher: ['/', '/visit/:path*'] }
