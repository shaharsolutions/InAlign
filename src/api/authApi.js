import { supabase } from '../lib/supabase.js'

// Mock Data Fallback
let mockCurrentUser = null;
const MOCK_PROFILES = {
  'admin@test.com': { id: 'usr-1', org_id: 'org-1', role: 'super_admin', full_name: 'מנהל על מרכזי' },
  'org@test.com': { id: 'usr-2', org_id: 'org-2', role: 'org_admin', full_name: 'מנהל הדרכה הייטק', org_color: '#198754' },
  'learner@test.com': { id: 'usr-3', org_id: 'org-2', role: 'learner', full_name: 'ישראל הלומד ציבורי', org_color: '#198754' }
};

export async function checkAuth() {
  if (supabase) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    return await fetchUserProfile(session.user.id);
  } else {
    // Mock
    const stored = localStorage.getItem('mock.auth.token');
    if (stored) {
      mockCurrentUser = JSON.parse(stored);
      return mockCurrentUser;
    }
    return null;
  }
}

export async function login(email, password) {
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const userProfile = await fetchUserProfile(data.user.id);
    
    // Update global state for synchronous router checks
    if (!window.__APP_STATE) window.__APP_STATE = {};
    window.__APP_STATE.user = userProfile;
    
    return userProfile;
  } else {
    // Mock Support
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const user = MOCK_PROFILES[email];
        if (user && password === '123456') {
           mockCurrentUser = user;
           localStorage.setItem('mock.auth.token', JSON.stringify(user));
           resolve(user);
        } else {
           reject(new Error('שם משתמש או סיסמה שגויים (Mock)'));
        }
      }, 500);
    });
  }
}

export async function logout() {
  if (supabase) {
    await supabase.auth.signOut();
  } else {
    mockCurrentUser = null;
    localStorage.removeItem('mock.auth.token');
  }
  if (window.__APP_STATE) window.__APP_STATE.user = null;
  window.location.hash = '#/login';
}

async function fetchUserProfile(userId) {
  // 1. Fetch the basic profile
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, org_id')
    .eq('id', userId);

  if (profileError) {
    console.error("Supabase Profile Fetch Error:", profileError);
    throw new Error('שגיאה בטעינת פרופיל משתמש');
  }

  // Handle case where profile row doesn't exist yet
  let profile = profiles && profiles.length > 0 ? profiles[0] : null;
  
  if (!profile) {
    console.error(`[LMS] No profile found for user ${userId}. Deleting session...`);
    // Optionally log out if no profile exists to keep things clean
    await supabase.auth.signOut();
    throw new Error('לא נמצא פרופיל משתמש במערכת. פנה למנהל המערכת.');
  }

  // 2. Separately fetch organization settings
  let orgSettings = null;
  if (profile.org_id) {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name, primary_color, logo_url')
      .eq('id', profile.org_id);
    
    if (orgData && orgData.length > 0) orgSettings = orgData[0];
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    orgId: profile.org_id,
    orgName: orgSettings?.name || null,
    orgColor: orgSettings?.primary_color || null,
    orgLogo: orgSettings?.logo_url || null
  };
}

export function getCurrentUserSync() {
  if (supabase) {
    // Requires pre-fetching from app root and injecting to window or state manager.
    // For this architecture MVP, we read from window object if populated.
    return window.__APP_STATE?.user || null;
  }
  return mockCurrentUser;
}

export function onAuthStatusChange(callback) {
  if (supabase) {
    return supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[LMS] Auth event: ${event}`);
      
      // Update global state immediately if session exists
      if (session?.user && !window.__APP_STATE?.user) {
          console.log("[LMS] Session found, updating app state...");
          // This will be populated properly by fetchUserProfile in main.js
      }

      if (event === 'SIGNED_OUT') {
        // Only redirect if we were actually logged in and now we are not
        if (window.__APP_STATE?.user && !session) {
          console.warn("[LMS] Verified sign out, redirecting...");
          window.__APP_STATE.user = null;
          if (window.location.hash !== '#/login') {
            window.location.hash = '#/login';
          }
        }
      }
      if (callback) callback(event, session);
    });
  }
}
