import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase dashboard shows the REST endpoint (…supabase.co/rest/v1) more
 * prominently than the bare project URL, and the client wants the bare one -
 * it appends /rest/v1 and /auth/v1 itself. Accept either.
 */
const normalizeUrl = (raw) =>
  raw?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') || ''

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL)
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// Without credentials the app still runs, just on this device only.
export const hasCloud = Boolean(url && key)

export const supabase = hasCloud
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
