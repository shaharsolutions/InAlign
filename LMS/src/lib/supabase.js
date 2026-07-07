import { createClient } from '@supabase/supabase-js'

// Safety check for environments without Vite (like VS Code Live Server / GitHub Pages)
const env = import.meta.env || {}
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://kvlwkmappgpamigxoiwc.supabase.co'
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bHdrbWFwcGdwYW1pZ3hvaXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTgzNDUsImV4cCI6MjA5NTg3NDM0NX0.XtOID0JN-go71FFHE5NzmJRyiaFnS3lYyH1yfLbQHOY'
const AUTO_REFRESH_RETRY_DELAY_MS = 60 * 1000

let autoRefreshEnabled = false
let lastAutoRefreshFailureAt = 0

function isBrowserOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function isSupabaseNetworkError(error) {
  if (!error) return false
  const message = String(error.message || error.error_description || error)
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Load failed') ||
    !isBrowserOnline()
  )
}

// This initializes the Supabase client
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;

export async function startSupabaseAutoRefresh() {
  if (!supabase || !isBrowserOnline()) return false
  if (autoRefreshEnabled) return true
  if (Date.now() - lastAutoRefreshFailureAt < AUTO_REFRESH_RETRY_DELAY_MS) return false

  try {
    await supabase.auth.startAutoRefresh()
    autoRefreshEnabled = true
    return true
  } catch (error) {
    lastAutoRefreshFailureAt = Date.now()
    console.warn('[Align] Supabase auto refresh is paused until connectivity returns.', error)
    return false
  }
}

export async function stopSupabaseAutoRefresh() {
  if (!supabase || !autoRefreshEnabled) return
  autoRefreshEnabled = false
  await supabase.auth.stopAutoRefresh()
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    stopSupabaseAutoRefresh().catch((error) => {
      console.warn('[Align] Failed to pause Supabase auto refresh.', error)
    })
  })

  window.addEventListener('online', () => {
    startSupabaseAutoRefresh()
  })
}

if (supabase) {
  console.log("✅ Supabase Connected Successfully");
} else {
  console.warn("⚠️ Supabase Client is NULL - Running in Mock Mode. Please restart Vite server.");
}
