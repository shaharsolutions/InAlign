import { supabase } from '../lib/supabase.js'

// Mock Data Fallback
let mockCurrentUser = null;
const MOCK_PROFILES = {
  'admin@test.com': { id: 'usr-1', org_id: 'org-1', role: 'super_admin', full_name: 'מנהל על מרכזי' },
  'org@test.com': { id: 'usr-2', org_id: 'org-2', role: 'org_admin', full_name: 'מנהל הדרכה הייטק' },
  'learner@test.com': { id: 'usr-3', org_id: 'org-2', role: 'learner', full_name: 'ישראל הלומד ציבורי' }
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
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, org_id, organizations(name)')
    .eq('id', userId)
    .single();

  if (error || !data) throw new Error('שגיאה בטעינת פרופיל משתמש');
  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role,
    orgId: data.org_id,
    orgName: data.organizations?.name
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
