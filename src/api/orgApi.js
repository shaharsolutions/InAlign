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
export async function fetchOrganizationById(id) {
    if (supabase) {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw new Error(error.message);
        return data;
    } else {
        return mockOrgs.find(o => o.id === id);
    }
}

export async function createOrganization(name, color = '#0066FF', logoUrl = '') {
  if (supabase) {
    const { data, error } = await supabase
      .from('organizations')
      .insert([{ 
          name, 
          primary_color: color, 
          logo_url: logoUrl,
          welcome_message: '',
          auto_enroll_course_ids: []
      }])
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

export async function updateOrganization(id, name, color, logoUrl, welcomeMessage, autoEnrollIds) {
  if (supabase) {
    const updateData = { name };
    if (color !== undefined) updateData.primary_color = color;
    if (logoUrl !== undefined) updateData.logo_url = logoUrl;
    if (welcomeMessage !== undefined) updateData.welcome_message = welcomeMessage;
    if (autoEnrollIds !== undefined) updateData.auto_enroll_course_ids = Array.isArray(autoEnrollIds) ? autoEnrollIds : (autoEnrollIds ? [autoEnrollIds] : []);

    const { data, error } = await supabase
      .from('organizations')
      .update(updateData)
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
  console.log(`[InAlign] Attempting to delete organization ${id}`);
  if (supabase) {
    const { error, count } = await supabase
      .from('organizations')
      .delete({ count: 'exact' })
      .eq('id', id);
    
    if (error) {
        console.error("[InAlign] Organization deletion error:", error);
        throw new Error(error.message);
    }
    
    console.log(`[InAlign] Organization delete count: ${count}`);
    if (count === 0) {
        throw new Error("לא נמצאה רשומה למחיקה או שאין הרשאות מתאימות (RLS)");
    }
    return true;
  } else {
    const initialLen = mockOrgs.length;
    mockOrgs = mockOrgs.filter(o => o.id !== id);
    console.log(`[InAlign] Mock deletion. Prev: ${initialLen}, Now: ${mockOrgs.length}`);
    return true;
  }
}
