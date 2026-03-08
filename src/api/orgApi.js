import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let mockOrgs = [
  { id: 'org-1', name: 'הנהלת המערכת', created_at: '01/01/2026', total_courses: 0, total_users: 1 },
  { id: 'org-2', name: 'טק לייט פתרונות', created_at: '10/01/2026', total_courses: 5, total_users: 120 }
]

export async function fetchOrganizations() {
  if (supabase) {
    // Requires super_admin
    const { data: orgs, error } = await supabase
      .from('organizations')
      .select('id, name, created_at');
    
    // In a real scenario, we would join with courses/profiles count. 
    // Supabase can do this using count query. For brevity, returning base orgs:
    if (error) throw new Error(error.message);
    return orgs;
  } else {
    return [...mockOrgs];
  }
}

export async function createOrganization(name, color = '#0066FF') {
  if (supabase) {
    const { data, error } = await supabase
      .from('organizations')
      .insert([{ name, primary_color: color }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  } else {
    const newOrg = { id: 'org-' + Date.now(), name, created_at: new Date().toLocaleDateString('he-IL'), total_courses: 0, total_users: 0 };
    mockOrgs.push(newOrg);
    return newOrg;
  }
}
