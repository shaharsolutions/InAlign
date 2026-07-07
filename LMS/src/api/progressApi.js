import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'
import { isManagementRole, isSuperAdminRole } from '../lib/roles.js'
import { getDisplayProgress } from '../lib/progressUtils.js'

let MOCK_RECORDS = [
  { id: '1', user_id: 'usr-3', user_name: 'ישראל הלומד ציבורי', course_id: 'c1', course_title: 'הדרכת אבטחת מידע בארגון - Q1', status: 'הושלם', progress_percent: 100, score: 95, time_spent_seconds: 1500, time: '25 דקות', date: '01/03/2026', org_id: 'org-2' },
  { id: '2', user_id: 'usr-2', user_name: 'דוד המנהל',   course_id: 'c2', course_title: 'הכרה ושימוש ב-AI בעבודה', status: 'בתהליך', progress_percent: 45, score: null, time_spent_seconds: 720, time: '12 דקות', date: '05/03/2026', org_id: 'org-2' },
]

function isDebugEnabled() {
  try {
    return typeof window !== 'undefined'
      && window.localStorage?.getItem('inalign:debug') === '1';
  } catch (e) {
    return false;
  }
}

function debugLog(...args) {
  if (isDebugEnabled()) console.debug(...args);
}

export async function fetchOrgProgress(explicitOrgId = null) {
  const user = getCurrentUserSync();
  // Allow Admin OR Super Admin to fetch progress reports
  if (!user || !isManagementRole(user.role)) throw new Error("אין הרשאה");

  const orgToFetch = explicitOrgId || user.orgId;
  debugLog(`[Align] Fetching progress report. User: ${user.id}, Role: ${user.role}, Requested Org: ${orgToFetch}`);

  if (supabase) {
    let query = supabase
      .from('learner_progress')
      .select(`
        id, user_id, course_id, status, progress_percent, score, time_spent_seconds, completed_at,
        profiles (full_name, role, phone, is_guest),
        courses (title)
      `);
    
    // If an org is specified (either by org_admin or explicitly by super_admin), filter it
    if (orgToFetch) {
        query = query.eq('org_id', orgToFetch);
    }
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    debugLog(`[Align] Returned ${data.length} records. First record time: ${data[0]?.time_spent_seconds}`);

    return data
      .filter(r => r.profiles?.role !== 'super_admin')
      .map(r => {
        const status = (function(status) {
          if (status === 'completed') return 'הושלם';
          if (status === 'in_progress') return 'בתהליך';
          return 'לא התחיל';
        })(r.status);
        const displayProgress = getDisplayProgress(r.progress_percent, r.status);
        return {
          id: r.id,
          user_id: r.user_id,
          course_id: r.course_id,
          user_name: r.profiles?.full_name,
          user_phone: r.profiles?.phone || '',
          is_guest: r.profiles?.is_guest === true,
          course_title: r.courses?.title,
          status,
          progress: displayProgress,
          progressKnown: displayProgress !== null,
          score: (r.score !== null && r.score !== undefined) ? r.score : '-',
          time: (function(s) {
              const seconds = parseInt(s || 0);
              if (seconds < 1) return '0 דקות';
              if (seconds < 60) return 'פחות מדקה';
              const mins = Math.round(seconds / 60);
              return (mins === 0 ? 'פחות מדקה' : mins + ' דקות');
          })(r.time_spent_seconds),
          date: r.completed_at ? new Date(r.completed_at).toLocaleDateString('he-IL') : '-'
        };
      });
  } else {
    const mockData = isSuperAdminRole(user.role) ? MOCK_RECORDS : MOCK_RECORDS.filter(r => r.org_id === user.orgId);
    return mockData.map(r => ({
        ...r,
        user_id: r.user_id,
        course_id: r.course_id,
        progress: getDisplayProgress(r.progress_percent, r.status === 'הושלם' ? 'completed' : r.status),
        progressKnown: getDisplayProgress(r.progress_percent, r.status === 'הושלם' ? 'completed' : r.status) !== null,
        time: Math.round((r.time_spent_seconds || 0) / 60) + ' דקות'
    }));
  }
}

export async function fetchLearnerAssignments() {
  const user = getCurrentUserSync();
  if (!user) throw new Error("לא מחובר");

  if (supabase) {
    let courses = [];
    let courseIds = [];

    if (isSuperAdminRole(user.role)) {
        // 1. Super Admin sees ALL published courses
        const { data, error } = await supabase
            .from('courses')
            .select('id, title, description, category, published')
            .eq('published', true);
        if (error) throw new Error(error.message);
        courses = data;
        courseIds = courses.map(c => c.id);
    } else {
        // 1. Regular user gets courses assigned to their groups
        const { data: memberships, error: memberError } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('user_id', user.id);
        
        if (memberError) throw new Error(memberError.message);
        const groupIds = memberships?.map(m => m.group_id) || [];
        
        let assignedIds = [];
        if (groupIds.length > 0) {
            const { data: gAssigns, error: gError } = await supabase
                .from('group_assignments')
                .select('course_id')
                .in('group_id', groupIds);
            if (!gError && gAssigns) {
                assignedIds = gAssigns.map(ga => ga.course_id);
            }
        }

        // 2. Add courses with individual progress
        const { data: directProgress, error: indError } = await supabase
            .from('learner_progress')
            .select('course_id')
            .eq('user_id', user.id);
        
        const individualIds = directProgress?.map(ia => ia.course_id) || [];
        courseIds = [...new Set([...assignedIds, ...individualIds])];

        if (courseIds.length === 0) return [];

        // 3. Fetch course details
        const { data: cDetails, error: coursesError } = await supabase
            .from('courses')
            .select('id, title, description, category, published')
            .in('id', courseIds)
            .eq('published', true);

        if (coursesError) throw new Error(coursesError.message);
        courses = cDetails;
    }

    if (courses.length === 0) return [];

    // 4. Fetch progress for these courses
    const { data: progresses, error: progressError } = await supabase
      .from('learner_progress')
      .select('course_id, status, progress_percent, score, time_spent_seconds')
      .eq('user_id', user.id)
      .in('course_id', courseIds);

    if (progressError) throw new Error(progressError.message);

    return courses.map(course => {
      const prog = progresses?.find(p => p.course_id === course.id);
      const status = (prog?.status === 'completed') ? 'completed' : 
                    (prog?.status === 'in_progress' ? 'in_progress' : 'not_started');
      const progress = getDisplayProgress(prog?.progress_percent, status);

      return {
        id: course.id,
        title: course.title,
        desc: course.description || course.desc,
        status: status,
        progress,
        progressKnown: progress !== null,
        score: prog?.score || null,
        image: course.image || 'bx-book'
      };
    });
  } else {
    // Mock implementation remains as is or can be filtered if needed
    const { fetchCourses } = await import('./coursesApi.js')
    const courses = await fetchCourses()
    return courses.map(c => {
      const prog = MOCK_RECORDS.find(r => r.course_id === c.id && r.user_id === user.id);
      const status = prog ? (prog.status === 'הושלם' ? 'completed' : 'in_progress') : 'not_started';
      const progress = getDisplayProgress(prog?.progress_percent, status);
      return {
        id: c.id,
        title: c.title,
        desc: c.desc || c.description,
        status,
        progress,
        progressKnown: progress !== null,
        score: prog ? prog.score : null,
        image: c.image || 'bx-book'
      };
    });
  }
}

export async function fetchCourseProgress(courseId) {
  const user = getCurrentUserSync();
  if (!user) return null;

  debugLog(`[Align] Fetching existing progress for user ${user.id} and course ${courseId}`);

  if (supabase) {
    const { data, error } = await supabase
      .from('learner_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle();
    
    if (error) {
      console.error("[Align] Error fetching course progress:", error.message);
      return null;
    }
    if (data) debugLog(`[Align] Found existing progress: status=${data.status}, seconds=${data.time_spent_seconds}`);
    return data;
  }
  return null;
}

export async function saveLearnerProgress(courseId, updates) {
  const user = getCurrentUserSync();
  if (!user) return;

  debugLog(`[Align] Saving runtime updates for course ${courseId}:`, updates);

  if (supabase) {
    try {
      let finalOrgId = user.orgId;

      if (!finalOrgId) {
        const { data: course, error: cError } = await supabase
          .from('courses')
          .select('org_id')
          .eq('id', courseId)
          .single();
        if (!cError && course) finalOrgId = course.org_id;
      }

      const progressObj = {
        progress_percent: (updates.progress === null || updates.progress === undefined || updates.progress === '') ? null : parseInt(updates.progress),
        status: updates.status,
        time_spent_seconds: parseInt(updates.time || 0),
        score: (updates.score !== undefined) ? parseInt(updates.score) : null,
        suspend_data: updates.suspend_data,
        lesson_location: updates.lesson_location,
        last_accessed: new Date().toISOString()
      };
      
      if (updates.status === 'completed') progressObj.completed_at = new Date().toISOString();
      
      debugLog(`[Align] Final payload to Supabase:`, progressObj);

      const { error } = await supabase
        .from('learner_progress')
        .upsert({
          user_id: user.id,
          course_id: courseId,
          org_id: finalOrgId,
          ...progressObj
        }, { onConflict: 'user_id, course_id' });
      
      if (error) {
        // If column is missing, we need to alert the developer/admin
        if (error.code === '42703' || error.message?.includes('lesson_location')) {
            console.error("[Align] CRITICAL: 'lesson_location' column is missing in your 'learner_progress' table. SCORM resume will NOT work until this is fixed in Supabase.");
        }
        console.error("[Align] Supabase Record Upsert Error:", error.message, error.code);
        throw error;
      }
      debugLog(`[Align] Progress successfully recorded for course ${courseId}. Location: ${progressObj.lesson_location}`);
    } catch (err) {
      console.error("[Align] Progress sync operation failed:", err);
      throw err;
    }
  } else {
    debugLog("[Align] Mock progress saved (NO-OP):", user.id, courseId, updates);
  }
}

export async function adminUpdateLearnerProgress(userId, courseId, updates) {
    const adminUser = getCurrentUserSync();
    if (!adminUser || !isManagementRole(adminUser.role)) {
        throw new Error("אין הרשאת ניהול לביצוע פעולה זו");
    }

    if (supabase) {
        const progressObj = {
            progress_percent: (updates.progress === null || updates.progress === undefined || updates.progress === '') ? null : parseInt(updates.progress),
            status: updates.status,
            score: updates.score !== null ? parseInt(updates.score) : null,
            last_accessed: new Date().toISOString()
        };
        
        if (updates.status === 'completed') {
            progressObj.completed_at = updates.completed_at || new Date().toISOString();
        } else {
            progressObj.completed_at = null;
        }

        const { error } = await supabase
            .from('learner_progress')
            .update(progressObj)
            .eq('user_id', userId)
            .eq('course_id', courseId);
            
        if (error) throw error;
    } else {
        const record = MOCK_RECORDS.find(r => r.user_id === userId && r.course_id === courseId);
        if (record) {
            record.progress_percent = (updates.progress === null || updates.progress === undefined || updates.progress === '') ? null : parseInt(updates.progress);
            record.status = updates.status === 'completed' ? 'הושלם' : updates.status === 'in_progress' ? 'בתהליך' : 'לא התחיל';
            record.score = updates.score !== null ? parseInt(updates.score) : null;
        }
    }
}

export async function bulkAssignCourses(userIds, courseId) {
    const adminUser = getCurrentUserSync();
    if (!adminUser) throw new Error("לא מחובר");

    if (supabase) {
        // Fetch org_id for the course
        const { data: course, error: cError } = await supabase
            .from('courses')
            .select('org_id')
            .eq('id', courseId)
            .single();
        
        if (cError) throw cError;
        
        const assignments = userIds.map(uid => ({
            user_id: uid,
            course_id: courseId,
            org_id: course.org_id,
            status: 'not_started',
            progress_percent: null,
            last_accessed: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('learner_progress')
            .upsert(assignments, { onConflict: 'user_id, course_id' });
            
        if (error) throw error;
    } else {
        // Mock (simplified)
        console.log(`[Align] Bulk assigning ${courseId} to ${userIds.length} users`);
    }
}

export async function resetUserProgress(userId, courseId = null) {
  if (supabase) {
    let query = supabase.from('learner_progress').delete().eq('user_id', userId);
    if (courseId) {
      query = query.eq('course_id', courseId);
    }
    const { error } = await query;
    if (error) throw new Error(error.message);
  } else {
    MOCK_RECORDS = MOCK_RECORDS.filter(p => {
      const matchUser = p.user_id === userId;
      const matchCourse = courseId ? p.course_id === courseId : true;
      return !(matchUser && matchCourse);
    });
  }
}

export async function resetOrgProgress(orgId) {
  if (supabase) {
    const { error } = await supabase.from('learner_progress').delete().eq('org_id', orgId);
    if (error) throw new Error(error.message);
  } else {
    MOCK_RECORDS = MOCK_RECORDS.filter(p => p.org_id !== orgId);
  }
}
