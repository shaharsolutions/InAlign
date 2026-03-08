import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_USERS = [
  { id: 'usr-2', full_name: 'דוד המנהל', role: 'org_admin', email: 'org@test.com', status: 'פעיל', org_id: 'org-2', created_at: '01/01/2026' },
  { id: 'usr-3', full_name: 'ישראל הלומד ציבורי', role: 'learner', email: 'learner@test.com', status: 'פעיל', org_id: 'org-2', created_at: '10/01/2026' },
  { id: 'usr-4', full_name: 'דינה כהן - מוקד', role: 'learner', email: 'dina@test.com', status: 'ממתין', org_id: 'org-2', created_at: '15/02/2026' }
]

export async function fetchUsers() {
  const currentUser = getCurrentUserSync();
  if (!currentUser || currentUser.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('org_id', currentUser.orgId);
      
    if (error) throw new Error(error.message);
    
    // In a real system, email and status might come from a secure view linking auth.users
    return data.map(u => ({
        ...u,
        email: '---', // Needs secure backend to fetch auth emails
        status: 'פעיל'
    }));
  } else {
    return MOCK_USERS.filter(u => u.org_id === currentUser.org_id);
  }
}

export async function createUser(userData) {
  const currentUser = getCurrentUserSync();
  if (!currentUser || currentUser.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    // Note: In Supabase, creating an auth user typically requires a backend Edge Function 
    // or using the Admin API, because client-side signups log the current user out.
    // For this MVP, we will simulate the profile creation or throw a supportive error.
    throw new Error('יצירת משתמשים דורשת חיבור ל-Edge Functions ב-Supabase שטרם הוגדר.');
  } else {
    // Mock
    const newUser = {
      id: 'usr-' + Date.now().toString().slice(-4),
      full_name: userData.fullName,
      email: userData.email,
      role: userData.role || 'learner',
      org_id: currentUser.org_id,
      status: 'פעיל',
      created_at: new Date().toLocaleDateString('he-IL')
    }
    MOCK_USERS.push(newUser);
    return newUser;
  }
}

export async function deleteUser(userId) {
  if (supabase) {
    // Requires Admin API or Edge Function
    throw new Error('מחיקת משתמשים דורשת API פנימי של השרת לאבטחה.');
  } else {
    MOCK_USERS = MOCK_USERS.filter(u => u.id !== userId);
  }
}
