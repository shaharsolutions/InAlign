import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'
import { ROLE_LEARNER, ROLE_ORG_ADMIN, isAdminRole, isManagementRole, isSuperAdminRole, isSystemAdminRole } from '../lib/roles.js'

let MOCK_USERS = [
  { id: 'usr-2', full_name: 'דוד המנהל', role: ROLE_ORG_ADMIN, email: 'org@test.com', status: 'פעיל', org_id: 'org-2', created_at: '01/01/2026' },
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

function canCreateUserRole(currentRole, targetRole) {
  const role = targetRole || ROLE_LEARNER;
  if (isSuperAdminRole(currentRole)) return true;
  if (isSystemAdminRole(currentRole)) return role === ROLE_LEARNER || role === ROLE_ORG_ADMIN;
  return role === ROLE_LEARNER;
}

export async function fetchUsers(targetOrgId = null, { includeAllRoles = false } = {}) {
  const currentUser = getCurrentUserSync();
  console.log(`[LMS] fetchUsers - Current User:`, currentUser);
  if (!currentUser || !isManagementRole(currentUser.role)) throw new Error("אין הרשאה");

  if (supabase) {
    let query = supabase
      .from('profiles')
      .select(`
        id, full_name, role, email, phone, created_at, org_id,
        organizations (name, auto_enroll_course_ids, primary_color, logo_url)
      `);
      
    // Managers are limited to their own organization. A super admin may
    // intentionally select one organization when assigning group members.
    // With includeAllRoles, this deliberately includes the current user too.
    if (isSuperAdminRole(currentUser.role) && targetOrgId) {
        query = query.eq('org_id', targetOrgId);
    } else if (!isSuperAdminRole(currentUser.role)) {
        if (currentUser.orgId) {
            query = query.eq('org_id', currentUser.orgId);
        } else {
            return [];
        }
    }
    
    if (!isSuperAdminRole(currentUser.role) && !includeAllRoles) {
        const hiddenRoles = isSystemAdminRole(currentUser.role)
            ? '(super_admin,admin)'
            : '(super_admin,admin,org_admin)';
        query = query.not('role', 'in', hiddenRoles);
    } else if (isSuperAdminRole(currentUser.role) && !includeAllRoles) {
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
    const userIds = (data || []).map(u => u.id).filter(Boolean);

    let groupMembers = [];
    let groups = [];
    let groupAssignments = [];
    let learnerProgress = [];
    let courses = [];

    if (userIds.length > 0) {
        const [
            groupMembersResult,
            progressResult
        ] = await Promise.all([
            supabase
                .from('group_members')
                .select('user_id, group_id')
                .in('user_id', userIds),
            supabase
                .from('learner_progress')
                .select('user_id, course_id')
                .in('user_id', userIds)
        ]);

        if (groupMembersResult.error) throw new Error(groupMembersResult.error.message);
        if (progressResult.error) throw new Error(progressResult.error.message);

        groupMembers = groupMembersResult.data || [];
        learnerProgress = progressResult.data || [];
    }

    const groupIds = [...new Set(groupMembers.map(member => member.group_id).filter(Boolean))];
    const progressCourseIds = learnerProgress.map(progress => progress.course_id).filter(Boolean);

    if (groupIds.length > 0) {
        const [
            groupsResult,
            groupAssignmentsResult
        ] = await Promise.all([
            supabase
                .from('groups')
                .select('id, name, org_id')
                .in('id', groupIds),
            supabase
                .from('group_assignments')
                .select('group_id, course_id')
                .in('group_id', groupIds)
        ]);

        if (groupsResult.error) throw new Error(groupsResult.error.message);
        if (groupAssignmentsResult.error) throw new Error(groupAssignmentsResult.error.message);

        groups = groupsResult.data || [];
        groupAssignments = groupAssignmentsResult.data || [];
    }

    const allCourseIds = [
        ...new Set([
            ...progressCourseIds,
            ...groupAssignments.map(assignment => assignment.course_id).filter(Boolean)
        ])
    ];

    if (allCourseIds.length > 0) {
        const { data: coursesData, error: coursesError } = await supabase
            .from('courses')
            .select('id, title')
            .in('id', allCourseIds);

        if (coursesError) throw new Error(coursesError.message);
        courses = coursesData || [];
    }

    const groupsById = new Map(groups.map(group => [group.id, group]));
    const courseTitleById = new Map(courses.map(course => [course.id, course.title]));
    const groupMembersByUserId = new Map();
    const progressByUserId = new Map();
    const assignmentsByGroupId = new Map();

    for (const member of groupMembers) {
        if (!groupMembersByUserId.has(member.user_id)) groupMembersByUserId.set(member.user_id, []);
        groupMembersByUserId.get(member.user_id).push(member);
    }

    for (const progress of learnerProgress) {
        if (!progressByUserId.has(progress.user_id)) progressByUserId.set(progress.user_id, []);
        progressByUserId.get(progress.user_id).push(progress);
    }

    for (const assignment of groupAssignments) {
        if (!assignmentsByGroupId.has(assignment.group_id)) assignmentsByGroupId.set(assignment.group_id, []);
        assignmentsByGroupId.get(assignment.group_id).push(assignment);
    }

    return data.map(u => {
        // Filter out any null groups or empty results from the join
        const userGroups = (groupMembersByUserId.get(u.id) || [])
            .map(member => groupsById.get(member.group_id))
            .filter(g => g && g.id && g.name);
            
        const autoEnrollIds = u.organizations?.auto_enroll_course_ids || [];
        const groupAssigns = userGroups.map(group => ({
            id: group.id,
            name: group.name,
            courseIds: (assignmentsByGroupId.get(group.id) || []).map(assignment => assignment.course_id)
        }));

        const assignedCourses = (progressByUserId.get(u.id) || [])
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
                    title: courseTitleById.get(cid),
                    source: source
                };
            })
            .filter(c => !!c.title);

        const orgInfo = Array.isArray(u.organizations) ? u.organizations[0] : u.organizations;

        return {
            ...u,
            org_name: orgInfo?.name || 'ללא ארגון',
            org_color: orgInfo?.primary_color || null,
            org_logo: orgInfo?.logo_url || null,
            orgColor: orgInfo?.primary_color || null, // UI expectations
            orgLogo: orgInfo?.logo_url || null, // UI expectations
            orgId: u.org_id, // Support both naming conventions
            phone: formatPhoneForDisplay(u.phone),
            email: u.email || '---', 
            status: 'פעיל',
            groups: userGroups,
            assigned_courses: assignedCourses
        };
    });
  } else {
    if (isSuperAdminRole(currentUser.role)) return MOCK_USERS;
    const effectiveOrgId = currentUser.orgId || currentUser.org_id;
    return MOCK_USERS.filter(u => u.org_id === effectiveOrgId && !isManagementRole(u.role));
  }
}

export async function bulkCreateUsers(usersData) {
  const currentUser = getCurrentUserSync();
  if (!currentUser || !isManagementRole(currentUser.role)) throw new Error("אין הרשאה");
  const blockedUser = usersData.find(user => !canCreateUserRole(currentUser.role, user.role));
  if (blockedUser) {
    throw new Error("אין הרשאה ליצור משתמש בתפקיד שנבחר");
  }

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        users: usersData.map(u => ({
          ...u,
          phone: formatPhoneToE164(u.phone)
        })),
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
        role: u.role || ROLE_LEARNER,
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
  if (!currentUser || !isManagementRole(currentUser.role)) throw new Error("אין הרשאה");
  if (!canCreateUserRole(currentUser.role, userData.role)) {
    throw new Error("אין הרשאה ליצור משתמש בתפקיד שנבחר");
  }

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: userData.email,
        password: userData.password,
        fullName: userData.fullName,
        phone: formatPhoneToE164(userData.phone),
        role: userData.role || ROLE_LEARNER,
        orgId: userData.orgId || currentUser.orgId
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
      role: userData.role || ROLE_LEARNER,
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
  if (!currentUser || !isManagementRole(currentUser.role)) throw new Error("אין הרשאה");
  if (!isSuperAdminRole(currentUser.role) && isAdminRole(userData.role)) {
    throw new Error("רק Super Admin רשאי למנות מנהלי מערכת");
  }

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
        role: userData.role || ROLE_LEARNER,
        orgId: finalOrgId
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

    return true;
  } else {
    // Mock
    const userIndex = MOCK_USERS.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      MOCK_USERS[userIndex].full_name = userData.fullName;
      MOCK_USERS[userIndex].role = userData.role || ROLE_LEARNER;
      if (userData.orgId) MOCK_USERS[userIndex].org_id = userData.orgId;
    }
    return true;
  }
}

export async function bulkDeleteUsers(userIds) {
  const currentUser = getCurrentUserSync();
  if (!currentUser || !isManagementRole(currentUser.role)) throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: {
        userIds: userIds
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
  if (!currentUser || !isManagementRole(currentUser.role)) throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: {
        userId: userId
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
    if (!currentUser || !isSuperAdminRole(currentUser.role)) throw new Error("רק מנהל על רשאי להעביר עובדים בין ארגונים");

    if (!userIds || userIds.length === 0) return true;

    if (supabase) {
        console.log(`[LMS] Bulk moving ${userIds.length} users to org ${newOrgId}`);

        // Organization changes are privileged mutations. Route every move
        // through the Edge Function, which verifies the caller from the JWT
        // and uses the service role only after that check.
        const results = await Promise.allSettled(userIds.map(userId =>
            supabase.functions.invoke('update-user', {
                body: { userId, orgId: newOrgId }
            })
        ));

        const failures = results.filter(result =>
            result.status === 'rejected' || result.value?.error || result.value?.data?.error
        );
        if (failures.length > 0) {
            throw new Error(`${failures.length} העברות בין ארגונים נכשלו`);
        }

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
    if (!currentUser || !isSuperAdminRole(currentUser.role)) throw new Error("רק מנהל על רשאי לשנות תפקידים באופן גורף");

    if (!userIds || userIds.length === 0) return true;

    if (supabase) {
        console.log(`[LMS] Bulk updating ${userIds.length} users to role ${newRole}`);

        const promisesList = userIds.map(uid => 
            supabase.functions.invoke('update-user', {
                body: {
                    userId: uid,
                    role: newRole
                }
            })
        );
        
        const results = await Promise.allSettled(promisesList);
        const failed = results.filter(result => {
            if (result.status === 'rejected') return true;
            return result.value?.error || result.value?.data?.error;
        });

        if (failed.length > 0) {
            console.warn(`[LMS] Bulk role update finished with ${failed.length} failures:`, failed);
            throw new Error(`${failed.length} עדכוני תפקיד נכשלו`);
        }

        console.log(`[LMS] Bulk role update finished successfully.`);
    } else {
        userIds.forEach(id => {
            const user = MOCK_USERS.find(u => u.id === id);
            if (user) user.role = newRole;
        });
    }
    return true;
}
