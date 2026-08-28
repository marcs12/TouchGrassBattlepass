import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without credentials the app still runs, just on this device only.
export const hasCloud = Boolean(url && key)

export const supabase = hasCloud
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
