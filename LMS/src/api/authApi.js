import {
  isSupabaseNetworkError,
  startSupabaseAutoRefresh,
  stopSupabaseAutoRefresh,
  supabase
} from '../lib/supabase.js'
import { ROLE_LEARNER, ROLE_ORG_ADMIN, ROLE_SUPER_ADMIN } from '../lib/roles.js'

// Mock Data Fallback
let mockCurrentUser = null;
const MOCK_PROFILES = {
  'admin@test.com': { id: 'usr-1', org_id: 'org-1', role: ROLE_SUPER_ADMIN, full_name: 'מנהל על מרכזי' },
  'org@test.com': { id: 'usr-2', org_id: 'org-2', role: ROLE_ORG_ADMIN, full_name: 'מנהל הדרכה הייטק', org_color: '#198754' },
  'learner@test.com': { id: 'usr-3', org_id: 'org-2', role: ROLE_LEARNER, full_name: 'ישראל הלומד ציבורי', org_color: '#198754' }
};

export async function checkAuth() {
  if (supabase) {
    let session = null;
    let error = null;

    try {
      const result = await supabase.auth.getSession();
      session = result.data.session;
      error = result.error;
    } catch (err) {
      error = err;
    }

    if (error) {
      if (isSupabaseNetworkError(error)) {
        console.warn('[Align] Supabase session refresh failed because the network is unavailable.', error);
        await stopSupabaseAutoRefresh();
        return null;
      }

      console.warn('[Align] Supabase session is invalid. Signing out.', error);
      await supabase.auth.signOut();
      return null;
    }

    if (error || !session) return null;
    
    const realUser = await fetchUserProfile(session.user.id);
    await startSupabaseAutoRefresh();
    
    // Check for impersonation
    const stored = localStorage.getItem('lms.impersonation');
    if (stored) {
      const impData = JSON.parse(stored);
      // Normalize to ensure both conventions are present
      const impersonated = {
          ...impData,
          fullName: impData.fullName || impData.full_name,
          full_name: impData.full_name || impData.fullName,
          orgId: impData.orgId || impData.org_id,
          org_id: impData.org_id || impData.orgId
      };
      // Ensure the original user metadata is attached for the "Stop" button
      return { ...impersonated, originalRole: realUser.role, isImpersonating: true };
    }
    
    return realUser;
  } else {
    // Mock
    const stored = localStorage.getItem('mock.auth.token');
    if (stored) {
      mockCurrentUser = JSON.parse(stored);
      
      const impStored = localStorage.getItem('lms.impersonation');
      if (impStored) {
          const impData = JSON.parse(impStored);
          const impersonated = {
              ...impData,
              fullName: impData.fullName || impData.full_name,
              full_name: impData.full_name || impData.fullName,
              orgId: impData.orgId || impData.org_id,
              org_id: impData.org_id || impData.orgId
          };
          return { ...impersonated, originalRole: mockCurrentUser.role, isImpersonating: true };
      }
      
      return mockCurrentUser;
    }
    return null;
  }
}

export async function login(email, password) {
  if (supabase) {
    let data = null;
    let error = null;

    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      data = result.data;
      error = result.error;
    } catch (err) {
      error = err;
    }

    if (isSupabaseNetworkError(error)) {
      throw new Error('לא ניתן להתחבר לשירות כרגע. בדוק את החיבור לאינטרנט ונסה שוב.');
    }

    if (error) throw new Error(error.message);
    const userProfile = await fetchUserProfile(data.user.id);
    await startSupabaseAutoRefresh();
    
    // Clear any stale impersonation on fresh login
    localStorage.removeItem('lms.impersonation');

    if (!window.__APP_STATE) window.__APP_STATE = {};
    window.__APP_STATE.user = userProfile;
    import('./activityLogApi.js')
      .then(({ logActivity }) => logActivity('login', {
        entityType: 'auth',
        entityId: userProfile.id,
        entityLabel: userProfile.fullName,
        orgId: userProfile.orgId,
        details: { email }
      }))
      .catch(() => {});
    
    return userProfile;
  } else {
    // Mock Support
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const user = MOCK_PROFILES[email];
        if (user && password === '123456') {
           mockCurrentUser = user;
           localStorage.setItem('mock.auth.token', JSON.stringify(user));
           localStorage.removeItem('lms.impersonation');
           resolve(user);
        } else {
           reject(new Error('שם משתמש או סיסמה שגויים (Mock)'));
        }
      }, 500);
    });
  }
}

export async function logout() {
  const activeUser = getCurrentUserSync();
  if (activeUser && supabase) {
    await import('./activityLogApi.js')
      .then(({ logActivity }) => logActivity('logout', {
        entityType: 'auth',
        entityId: activeUser.id,
        entityLabel: activeUser.fullName || activeUser.full_name,
        orgId: activeUser.orgId || activeUser.org_id
      }))
      .catch(() => {});
  }
  localStorage.removeItem('lms.impersonation');
  localStorage.removeItem('lms.guest.courseId');
  if (supabase) {
    await stopSupabaseAutoRefresh();
    await supabase.auth.signOut();
  } else {
    mockCurrentUser = null;
    localStorage.removeItem('mock.auth.token');
  }
  if (window.__APP_STATE) window.__APP_STATE.user = null;
  window.location.hash = '#/login';
}

export async function impersonateUser(targetUser) {
    console.log(`[Align] Starting impersonation of ${targetUser.full_name}`);
    import('./activityLogApi.js')
      .then(({ logActivity }) => logActivity('impersonate', {
        entityType: 'profiles',
        entityId: targetUser.id,
        entityLabel: targetUser.full_name || targetUser.fullName,
        orgId: targetUser.org_id || targetUser.orgId,
        details: { targetRole: targetUser.role }
      }))
      .catch(() => {});
    
    // Store in localStorage for persistence
    localStorage.setItem('lms.impersonation', JSON.stringify(targetUser));
    
    // Update live state
    const currentUser = getCurrentUserSync();
    if (window.__APP_STATE) {
        window.__APP_STATE.user = { 
            ...targetUser, 
            originalRole: currentUser?.originalRole || currentUser?.role,
            isImpersonating: true 
        };
    }
    
    // Force reload to apply all changes across all pages/components
    window.location.reload();
}

export async function stopImpersonating() {
    console.log(`[Align] Stopping impersonation`);
    localStorage.removeItem('lms.impersonation');
    window.location.reload();
}

async function fetchUserProfile(userId) {
  // 1. Fetch the basic profile
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, org_id, phone, is_guest')
    .eq('id', userId);

  if (profileError) {
    console.error("Supabase Profile Fetch Error:", profileError);
    throw new Error('שגיאה בטעינת פרופיל משתמש');
  }

  // Handle case where profile row doesn't exist yet
  let profile = profiles && profiles.length > 0 ? profiles[0] : null;
  
  if (!profile) {
    console.error(`[Align] No profile found for user ${userId}. Deleting session...`);
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
    phone: profile.phone || '',
    isGuest: profile.is_guest === true,
    orgName: orgSettings?.name || null,
    orgColor: orgSettings?.primary_color || null,
    orgLogo: orgSettings?.logo_url || null
  };
}

export function getCurrentUserSync() {
  if (supabase) {
    return window.__APP_STATE?.user || null;
  }
  
  // Mock logic
  if (mockCurrentUser) {
      const impStored = localStorage.getItem('lms.impersonation');
      if (impStored) {
          const impData = JSON.parse(impStored);
          const impersonated = {
              ...impData,
              fullName: impData.fullName || impData.full_name,
              full_name: impData.full_name || impData.fullName,
              orgId: impData.orgId || impData.org_id,
              org_id: impData.org_id || impData.orgId
          };
          return { ...impersonated, originalRole: mockCurrentUser.role, isImpersonating: true };
      }
  }
  return mockCurrentUser;
}

export function onAuthStatusChange(callback) {
  if (supabase) {
    return supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Align] Auth event: ${event}`);
      
      if (event === 'SIGNED_OUT') {
        stopSupabaseAutoRefresh().catch((error) => {
          console.warn('[Align] Failed to pause Supabase auto refresh.', error);
        });
        localStorage.removeItem('lms.impersonation');
        if (window.__APP_STATE?.user && !session) {
          console.warn("[Align] Verified sign out, redirecting...");
          window.__APP_STATE.user = null;
          if (window.location.hash !== '#/login') {
            window.location.hash = '#/login';
          }
        }
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        startSupabaseAutoRefresh();
      }
      if (callback) callback(event, session);
    });
  }
}
