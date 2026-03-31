import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Safety check for environments without Vite (like VS Code Live Server / GitHub Pages)
const env = import.meta.env || {}
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://iduyexkzivtnvrdsbwig.supabase.co'
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkdXlleGt6aXZ0bnZyZHNid2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjYwMTYsImV4cCI6MjA4OTA0MjAxNn0.MhqZwvY7RiOBBqgBhRD-e-SqbI7NIf2vWxNuD5_6e48'

// This initializes the Supabase client
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (supabase) {
  console.log("✅ Supabase Connected Successfully");
} else {
  console.warn("⚠️ Supabase Client is NULL - Running in Mock Mode. Please restart Vite server.");
}
