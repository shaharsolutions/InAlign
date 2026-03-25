import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_GROUPS = [
  { id: 'grp-1', name: 'מחלקת שיווק', org_id: 'org-2', user_count: 5, course_count: 2 },
  { id: 'grp-2', name: 'מכירות שטח', org_id: 'org-2', user_count: 8, course_count: 1 }
];

let MOCK_GROUP_MEMBERS = [];
let MOCK_GROUP_COURSES = [];

export async function fetchGroups() {
  const user = getCurrentUserSync();
  if (!user) throw new Error("לא מחובר");

  if (supabase) {
    let query = supabase
      .from('groups')
      .select(`
        id, name, created_at,
        members:group_members(count),
        courses:group_assignments(count)
      `);
    
    if (user.orgId) {
      query = query.eq('org_id', user.orgId);
    } else if (user.role !== 'super_admin') {
      throw new Error("לא נמצא מזהה ארגון עבור המשתמש");
    }

    const { data, error } = await query;
    
    if (error) throw new Error(error.message);
    
    return data.map(g => ({
      ...g,
      user_count: g.members?.[0]?.count || 0,
      course_count: g.courses?.[0]?.count || 0
    }));
  } else {
    return MOCK_GROUPS.filter(g => g.org_id === user.orgId);
  }
}

export async function createGroup(name) {
  const user = getCurrentUserSync();
  if (!user || user.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase
      .from('groups')
      .insert([{ name, org_id: user.orgId }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  } else {
    const newGrp = { id: 'grp-' + Date.now(), name, org_id: user.orgId, user_count: 0, course_count: 0 };
    MOCK_GROUPS.push(newGrp);
    return newGrp;
  }
}

export async function deleteGroup(id) {
  if (supabase) {
    console.log(`[LMS] Deleting group ${id}`);
    
    // 1. Explicitly clean up assignments and members to be safe (even with Cascade)
    await supabase.from('group_assignments').delete().eq('group_id', id);
    await supabase.from('group_members').delete().eq('group_id', id);

    // 2. Perform the actual group deletion
    const { error, count } = await supabase
        .from('groups')
        .delete({ count: 'exact' })
        .eq('id', id);
        
    if (error) throw new Error(error.message);
    if (count === 0) {
        console.warn(`[LMS] Group ${id} was not found or could not be deleted.`);
    }
  } else {
    MOCK_GROUPS = MOCK_GROUPS.filter(g => g.id !== id);
  }
}

export async function fetchGroupMembers(groupId) {
  if (supabase) {
    const { data, error } = await supabase
      .from('group_members')
      .select(`
        user_id,
        profiles (id, full_name, email)
      `)
      .eq('group_id', groupId);
    if (error) throw new Error(error.message);
    return data.map(m => m.profiles);
  } else {
    return []; // Mock simplified
  }
}

export async function assignUsersToGroup(groupId, userIds) {
  if (supabase) {
    // 1. Mark group membership
    const inserts = userIds.map(uid => ({ group_id: groupId, user_id: uid }));
    const { error: membersError } = await supabase.from('group_members').upsert(inserts, { onConflict: 'group_id, user_id' });
    if (membersError) throw new Error(membersError.message);

    // 2. Proactively initialize learner_progress for these users for all courses already assigned to the group
    // This ensures they show up correctly in reports and have tracking state ready.
    const { data: assignments } = await supabase
      .from('group_assignments')
      .select(`
        course_id,
        courses (org_id)
      `)
      .eq('group_id', groupId);

    if (assignments && assignments.length > 0) {
      const progressInserts = [];
      
      for (const uid of userIds) {
        for (const asg of assignments) {
          progressInserts.push({
            user_id: uid,
            course_id: asg.course_id,
            org_id: asg.courses?.org_id,
            status: 'not_started',
            progress_percent: 0,
            last_accessed: new Date().toISOString()
          });
        }
      }

      if (progressInserts.length > 0) {
        // Use upsert to avoid duplicate errors if progress already exists for some reason
        const { error: progError } = await supabase
          .from('learner_progress')
          .upsert(progressInserts, { onConflict: 'user_id, course_id' });
        
        if (progError) {
          console.error("[LMS] Error initializing progress for new group members:", progError.message);
          // We don't throw here to avoid failing the membership update if only progress init fails
        }
      }
    }
  } else {
    console.log(`[MOCK] Assigned users ${userIds} to group ${groupId}`);
  }
}

export async function removeUserFromGroup(groupId, userId) {
    if(supabase) {
        // 1. Get courses assigned to this group before removing user
        const { data: groupCourses } = await supabase
            .from('group_assignments')
            .select('course_id')
            .eq('group_id', groupId);

        // 2. Remove member
        const {error} = await supabase.from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', userId);
        if(error) throw new Error(error.message);

        // 3. Cleanup learner_progress for courses user hasn't started
        if (groupCourses && groupCourses.length > 0) {
            const courseIds = groupCourses.map(c => c.course_id);
            await supabase
                .from('learner_progress')
                .delete()
                .eq('user_id', userId)
                .in('course_id', courseIds)
                .eq('status', 'not_started')
                .filter('time_spent_seconds', 'lt', 60);
        }
    }
}

export async function fetchGroupCourses(groupId) {
    if (supabase) {
        const { data, error } = await supabase
            .from('group_assignments')
            .select(`
                course_id,
                courses (id, title, category)
            `)
            .eq('group_id', groupId);
        
        if (error) throw new Error(error.message);
        return data.map(d => d.courses);
    }
    return [];
}

export async function unassignCourseFromGroup(groupId, courseId) {
    if (supabase) {
        // 1. Get users in this group
        const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);

        // 2. Remove group assignment
        const { error } = await supabase
            .from('group_assignments')
            .delete()
            .eq('group_id', groupId)
            .eq('course_id', courseId);
        if (error) throw new Error(error.message);

        // 3. Cleanup learner_progress for group members who haven't started
        if (members && members.length > 0) {
            const uids = members.map(m => m.user_id);
            await supabase
                .from('learner_progress')
                .delete()
                .in('user_id', uids)
                .eq('course_id', courseId)
                .eq('status', 'not_started')
                .filter('time_spent_seconds', 'lt', 60);
        }
    }
}

export async function assignCourseToGroup(groupId, courseId) {
    const user = getCurrentUserSync();
    if (supabase) {
        // 1. Mark group assignment
        const { error: asgError } = await supabase
            .from('group_assignments')
            .upsert([{ group_id: groupId, course_id: courseId }], { onConflict: 'group_id, course_id' });
        
        if (asgError) throw new Error(asgError.message);

        // 2. Fetch the course to get its org_id
        const { data: course, error: cError } = await supabase
            .from('courses')
            .select('org_id')
            .eq('id', courseId)
            .single();
        
        if (cError) throw cError;

        // 3. Fetch all members and insert into learner_progress
        const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
        
        if (members && members.length > 0) {
            const progressInserts = members.map(m => ({
                user_id: m.user_id,
                course_id: courseId,
                org_id: course.org_id,
                status: 'not_started',
                progress_percent: 0,
                last_accessed: new Date().toISOString()
            }));

            const { error: progError } = await supabase
                .from('learner_progress')
                .upsert(progressInserts, { onConflict: 'user_id, course_id' });
            
            if (progError) throw progError;
        }
    } else {
        console.log(`[MOCK] Assigned course ${courseId} to group ${groupId}`);
    }
}

