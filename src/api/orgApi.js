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
        .select(`
          id, name, primary_color, created_at, logo_url,
          profiles:profiles(count),
          courses:courses(count)
        `);
      
      if (error) throw new Error(error.message);
      
      return orgs.map(o => ({
        ...o,
        total_users: o.profiles?.[0]?.count || 0,
        total_courses: o.courses?.[0]?.count || 0
      }));
    } else {
    return [...mockOrgs];
  }
}

export async function createOrganization(name, color = '#0066FF', logoUrl = '') {
  if (supabase) {
    const { data, error } = await supabase
      .from('organizations')
      .insert([{ name, primary_color: color, logo_url: logoUrl }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  } else {
    const newOrg = { id: 'org-' + Date.now(), name, created_at: new Date().toLocaleDateString('he-IL'), total_courses: 0, total_users: 0, primary_color: color, logo_url: logoUrl };
    mockOrgs.push(newOrg);
    return newOrg;
  }
}

export async function updateOrganization(id, name, color, logoUrl) {
  if (supabase) {
    const { data, error } = await supabase
      .from('organizations')
      .update({ name, primary_color: color, logo_url: logoUrl })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  } else {
    const org = mockOrgs.find(o => o.id === id);
    if (org) {
      org.name = name;
    }
    return org;
  }
}

export async function deleteOrganization(id) {
  console.log(`[LMS] Attempting to delete organization ${id}`);
  if (supabase) {
    const { error, count } = await supabase
      .from('organizations')
      .delete({ count: 'exact' })
      .eq('id', id);
    
    if (error) {
        console.error("[LMS] Organization deletion error:", error);
        throw new Error(error.message);
    }
    
    console.log(`[LMS] Organization delete count: ${count}`);
    if (count === 0) {
        throw new Error("לא נמצאה רשומה למחיקה או שאין הרשאות מתאימות (RLS)");
    }
    return true;
  } else {
    const initialLen = mockOrgs.length;
    mockOrgs = mockOrgs.filter(o => o.id !== id);
    console.log(`[LMS] Mock deletion. Prev: ${initialLen}, Now: ${mockOrgs.length}`);
    return true;
  }
}
