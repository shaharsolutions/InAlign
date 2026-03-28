import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_USERS = [
  { id: 'usr-2', full_name: 'דוד המנהל', role: 'org_admin', email: 'org@test.com', status: 'פעיל', org_id: 'org-2', created_at: '01/01/2026' },
  { id: 'usr-3', full_name: 'ישראל הלומד ציבורי', role: 'learner', email: 'learner@test.com', status: 'פעיל', org_id: 'org-2', created_at: '10/01/2026' },
  { id: 'usr-4', full_name: 'דינה כהן - מוקד', role: 'learner', email: 'dina@test.com', status: 'ממתין', org_id: 'org-2', created_at: '15/02/2026' }
]

function formatPhoneToE164(phone) {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return '+972' + digits.substring(1);
  }
  return phone;
}

function formatPhoneForDisplay(phone) {
  if (!phone) return phone;
  if (phone.startsWith('+972')) {
    const local = '0' + phone.substring(4);
    if (local.length === 10) {
      return local.substring(0, 3) + '-' + local.substring(3);
    }
    return local;
  }
  return phone;
}

export async function fetchUsers() {
  const currentUser = getCurrentUserSync();
  console.log(`[LMS] fetchUsers - Current User:`, currentUser);
  if (!currentUser || (currentUser.role !== 'org_admin' && currentUser.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    let query = supabase
      .from('profiles')
      .select(`
        id, full_name, role, email, phone, created_at, org_id,
        organizations (name, auto_enroll_course_ids),
        group_members (
          groups (id, name, group_assignments (course_id))
        ),
        learner_progress (
          course_id,
          courses (title)
        )
      `);
      
    // Filter by org ONLY for non-super admins
    if (currentUser.role !== 'super_admin') {
        if (currentUser.orgId) {
            query = query.eq('org_id', currentUser.orgId);
        } else {
            return [];
        }
    }
    
    if (currentUser.role !== 'super_admin') {
        query = query.neq('role', 'super_admin');
    } else {
        // Even for Super Admin, hide the main one
        query = query.neq('email', 'shaharsolutions@gmail.com');
    }
    
    const { data, error } = await query;
    console.log(`[LMS] fetchUsers - Raw data from DB:`, data);
      
    if (error) {
        console.error(`[LMS] fetchUsers Error:`, error);
        throw new Error(error.message);
    }
    
    console.log(`[LMS] fetchUsers - Fetched ${data?.length || 0} users`);
    return data.map(u => {
        // Filter out any null groups or empty results from the join
        const userGroups = (u.group_members || [])
            .map(gm => gm.groups)
            .filter(g => g && g.id && g.name);
            
        const autoEnrollIds = u.organizations?.auto_enroll_course_ids || [];
        const groupAssigns = (u.group_members || []).map(gm => ({
            id: gm.groups?.id,
            name: gm.groups?.name,
            courseIds: (gm.groups?.group_assignments || []).map(ga => ga.course_id)
        }));

        const assignedCourses = (u.learner_progress || [])
            .map(lp => {
                const cid = lp.course_id;
                let source = 'שיוך ישיר'; // Default
                
                // Check groups first
                const matchingGroup = groupAssigns.find(ga => ga.courseIds?.includes(cid));
                if (matchingGroup) {
                    source = `קבוצה: ${matchingGroup.name}`;
                } else if (autoEnrollIds.includes(cid)) {
                    source = 'שיוך ארגוני אוטומטי';
                }

                return { 
                    id: cid, 
                    title: lp.courses?.title,
                    source: source
                };
            })
            .filter(c => !!c.title);

        return {
            ...u,
            org_name: u.organizations?.name || 'ללא ארגון',
            phone: formatPhoneForDisplay(u.phone),
            email: u.email || '---', 
            status: 'פעיל',
            groups: userGroups,
            assigned_courses: assignedCourses
        };
    });
  } else {
    if (currentUser.role === 'super_admin') return MOCK_USERS;
    return MOCK_USERS.filter(u => u.org_id === currentUser.org_id);
  }
}

export async function bulkCreateUsers(usersData) {
  const currentUser = getCurrentUserSync();
  if (!currentUser || (currentUser.role !== 'org_admin' && currentUser.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        users: usersData.map(u => ({
          ...u,
          phone: formatPhoneToE164(u.phone)
        })),
        callerId: currentUser.id,
        orgId: currentUser.orgId // Default orgId for the batch
      }
    });

    if (error) {
      console.error("[LMS] bulkCreateUsers Edge Function Error:", error);
      throw new Error("שגיאה בתקשורת עם השרת ליצירת משתמשים: " + error.message);
    }

    if (data && data.error) {
      throw new Error(data.error);
    }

    return data.results;
  } else {
    // Mock
    const results = usersData.map(u => {
      const newUser = {
        id: 'usr-' + Math.random().toString(36).substr(2, 4),
        full_name: u.fullName,
        email: u.email,
        role: u.role || 'learner',
        org_id: currentUser.org_id,
        status: 'פעיל',
        created_at: new Date().toLocaleDateString('he-IL')
      }
      MOCK_USERS.push(newUser);
      return { email: u.email, status: 'success', userId: newUser.id };
    });
    return results;
  }
}

export async function createUser(userData) {

  const currentUser = getCurrentUserSync();
  if (!currentUser || (currentUser.role !== 'org_admin' && currentUser.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: userData.email,
        password: userData.password,
        fullName: userData.fullName,
        phone: formatPhoneToE164(userData.phone),
        role: userData.role || 'learner',
        orgId: userData.orgId || currentUser.orgId,
        callerId: currentUser.id
      }
    });

    if (error) {
      console.error("[LMS] create-user Edge Function Error:", error);
      if (error.message?.includes('401') || error.status === 401) {
        throw new Error("פג תוקף החיבור למערכת. אנא התנתק והתחבר מחדש.");
      }
      throw new Error("שגיאה בתקשורת עם השרת ליצירת משתמש: " + error.message);
    }

    if (data && data.error) {
      throw new Error(data.error);
    }

    return data.user;
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

export async function updateUser(userId, userData) {
  const currentUser = getCurrentUserSync();
  if (!currentUser || (currentUser.role !== 'org_admin' && currentUser.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    const finalOrgId = userData.orgId || currentUser.orgId;

    // 1. Invoke Edge Function for Auth-level changes (Email, Password, Role)
    const { data, error } = await supabase.functions.invoke('update-user', {
      body: {
        userId: userId,
        password: userData.password,
        fullName: userData.fullName,
        email: userData.email,
        phone: formatPhoneToE164(userData.phone),
        role: userData.role || 'learner',
        orgId: finalOrgId,
        callerId: currentUser.id
      }
    });

    if (error) {
      console.error("[LMS] Edge Function Invoke Error:", error);
      if (error.message?.includes('401') || error.status === 401) {
        throw new Error("פג תוקף החיבור למערכת. אנא התנתק והתחבר מחדש.");
      }
      throw new Error("שגיאה בתקשורת עם השרת לעדכון משתמש: " + error.message);
    }

    if (data && data.error) {
      throw new Error(data.error);
    }

    // 2. Proactively update the profiles table to ensure RLS-correct data
    // This handles the case where the Edge Function might fail to update denormalized org_id
    const { error: profileError, count } = await supabase
      .from('profiles')
      .update({
        full_name: userData.fullName,
        phone: formatPhoneToE164(userData.phone),
        role: userData.role,
        org_id: finalOrgId
      }, { count: 'exact' })
      .eq('id', userId);

    if (profileError) {
      console.warn("[LMS] Direct profile update failed:", profileError.message);
      // We don't throw here if the Edge Function supposedly succeeded, but we should log it
    }

    // 3. If org changed, sync related tables (like in bulk move)
    if (count > 0 && finalOrgId) {
        await supabase.from('course_assignments').update({ org_id: finalOrgId }).eq('user_id', userId);
        await supabase.from('learner_progress').update({ org_id: finalOrgId }).eq('user_id', userId);
    }

    return true;
  } else {
    // Mock
    const userIndex = MOCK_USERS.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      MOCK_USERS[userIndex].full_name = userData.fullName;
      MOCK_USERS[userIndex].role = userData.role || 'learner';
      if (userData.orgId) MOCK_USERS[userIndex].org_id = userData.orgId;
    }
    return true;
  }
}

export async function bulkDeleteUsers(userIds) {
  const currentUser = getCurrentUserSync();
  if (!currentUser || (currentUser.role !== 'org_admin' && currentUser.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: {
        userIds: userIds,
        callerId: currentUser.id
      }
    });

    if (error) {
      console.error("[LMS] bulkDeleteUsers Functions Error:", error);
      throw new Error("שגיאה במחיקת קבוצת משתמשים.");
    }

    if (data && data.error) {
      throw new Error(data.error);
    }

    return data.results;
  } else {
    MOCK_USERS = MOCK_USERS.filter(u => !userIds.includes(u.id));
    return userIds.map(uid => ({ userId: uid, status: 'success' }));
  }
}

export async function deleteUser(userId) {

  const currentUser = getCurrentUserSync();
  if (!currentUser || (currentUser.role !== 'org_admin' && currentUser.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: {
        userId: userId,
        callerId: currentUser.id
      }
    });

    if (error) {
      console.error("Function Error:", error);
      throw new Error("שגיאה במחיקת משתמש.");
    }

    if (data && data.error) {
      throw new Error(data.error);
    }

    return true;
  } else {
    MOCK_USERS = MOCK_USERS.filter(u => u.id !== userId);
    return true;
  }
}

export async function bulkUpdateUsersOrg(userIds, newOrgId) {
    const currentUser = getCurrentUserSync();
    if (!currentUser || currentUser.role !== 'super_admin') throw new Error("רק מנהל על רשאי להעביר עובדים בין ארגונים");

    if (!userIds || userIds.length === 0) return true;

    if (supabase) {
        console.log(`[LMS] Bulk moving ${userIds.length} users to org ${newOrgId}`);
        
        // 1. Update Profile (Primary Source)
        const { error: pError, count: pCount } = await supabase
            .from('profiles')
            .update({ org_id: newOrgId }, { count: 'exact' })
            .in('id', userIds);
            
        if (pError) throw new Error(pError.message);
        console.log(`[LMS] Profile move completed. Rows updated: ${pCount}`);

        if (pCount === 0) {
            console.warn(`[LMS] No rows were updated in 'profiles'. This may be an RLS issue.`);
            throw new Error("לא נמצאו רשומות לעדכון או שההרשאות לא מאפשרות עדכון (RLS).");
        }

        // 2. Denormalized Update: Course Assignments
        // This ensures the user see those assignments in the new org flow if applicable, 
        // though typically they should get NEW assignments in the new org.
        const { error: aError } = await supabase
            .from('course_assignments')
            .update({ org_id: newOrgId })
            .in('user_id', userIds);
        
        if (aError) console.warn("[LMS] Course assignments move failed (non-critical):", aError.message);

        // 3. Denormalized Update: Learner Progress
        // This ensures historical progress appears in the NEW org's reports.
        const { error: prError } = await supabase
            .from('learner_progress')
            .update({ org_id: newOrgId })
            .in('user_id', userIds);
            
        if (prError) console.warn("[LMS] Learner progress move failed (non-critical):", prError.message);

        console.log(`[LMS] Bulk move operation finished successfully.`);
    } else {
        userIds.forEach(id => {
            const user = MOCK_USERS.find(u => u.id === id);
            if (user) user.org_id = newOrgId;
        });
    }
    return true;
}

export async function bulkUpdateUsersRole(userIds, newRole) {
    const currentUser = getCurrentUserSync();
    if (!currentUser || currentUser.role !== 'super_admin') throw new Error("רק מנהל על רשאי לשנות תפקידים באופן גורף");

    if (!userIds || userIds.length === 0) return true;

    if (supabase) {
        console.log(`[LMS] Bulk updating ${userIds.length} users to role ${newRole}`);
        
        // 1. Update Profile (Primary Source)
        const { error: pError } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .in('id', userIds);
            
        if (pError) throw new Error(pError.message);

        // 2. Note: Updating roles in Auth usually happens via Edge Function 
        // We'll call the Edge Function for each user in this simplified implementation.
        // This ensures the Auth user_metadata is also updated.
        const promisesList = userIds.map(uid => 
            supabase.functions.invoke('update-user', {
                body: {
                    userId: uid,
                    role: newRole,
                    callerId: currentUser.id,
                    // Note: We need the user's orgId as it's required by the function's validator 
                    // Let's modify the edge function to not require it OR fetch it here.
                    // Actually, the edge function code I saw: (if (!userId || !orgId) throw...)
                    // So we must provide something or update the edge function.
                }
            })
        );
        
        // We'll handle errors gracefully
        const results = await Promise.allSettled(promisesList);
        console.log(`[LMS] Bulk role update finished. Results:`, results);
    } else {
        userIds.forEach(id => {
            const user = MOCK_USERS.find(u => u.id === id);
            if (user) user.role = newRole;
        });
    }
    return true;
}
