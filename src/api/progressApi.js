import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_RECORDS = [
  { id: '1', user_id: 'usr-3', user_name: 'ישראל הלומד ציבורי', course_id: 'c1', course_title: 'הדרכת אבטחת מידע בארגון - Q1', status: 'הושלם', progress: 100, score: 95, time: '25 דקות', date: '01/03/2026', org_id: 'org-2' },
  { id: '2', user_id: 'usr-2', user_name: 'דוד המנהל',   course_id: 'c2', course_title: 'הכרה ושימוש ב-AI בעבודה', status: 'בתהליך', progress: 45, score: null, time: '12 דקות', date: '05/03/2026', org_id: 'org-2' },
]

export async function fetchOrgProgress() {
  const user = getCurrentUserSync();
  if (!user || user.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    // Joins users and courses to build the report
    const { data, error } = await supabase
      .from('learner_progress')
      .select(`
        id, status, progress_percent, score, time_spent_seconds, completed_at,
        profiles (full_name),
        courses (title)
      `)
      .eq('org_id', user.orgId);
    
    if (error) throw new Error(error.message);
    
    return data.map(r => ({
      id: r.id,
      user_name: r.profiles?.full_name,
      course_title: r.courses?.title,
      status: r.status === 'completed' ? 'הושלם' : r.status === 'in_progress' ? 'בתהליך' : 'לא התחיל',
      progress: r.progress_percent,
      score: r.score || '-',
      time: Math.floor(r.time_spent_seconds / 60) + ' דקות',
      date: r.completed_at ? new Date(r.completed_at).toLocaleDateString('he-IL') : '-'
    }));
  } else {
    return MOCK_RECORDS.filter(r => r.org_id === user.org_id);
  }
}

export async function fetchLearnerAssignments() {
  const user = getCurrentUserSync();
  if (!user) throw new Error("לא מחובר");

  if (supabase) {
    // Fetch assignments for this user
    const { data: assignments, error: assignError } = await supabase
      .from('course_assignments')
      .select('course_id')
      .eq('user_id', user.id);
      
    if (assignError) throw new Error(assignError.message);
    if (!assignments || assignments.length === 0) return [];

    const courseIds = assignments.map(a => a.course_id);

    // Fetch the courses details
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, description, category, published')
      .in('id', courseIds)
      .eq('published', true);

    if (coursesError) throw new Error(coursesError.message);

    // Fetch the user's progress for these courses
    const { data: progresses, error: progressError } = await supabase
      .from('learner_progress')
      .select('course_id, status, progress_percent, score')
      .eq('user_id', user.id)
      .in('course_id', courseIds);

    if (progressError) throw new Error(progressError.message);

    // Combine the data in JS
    return courses.map(course => {
      const prog = progresses?.find(p => p.course_id === course.id);
      return {
        id: course.id,
        title: course.title,
        desc: course.description,
        status: prog?.status || 'not_started',
        progress: prog?.progress_percent || 0,
        score: prog?.score || null,
        image: 'bx-book'
      };
    });
  } else {
    // Fallback: Use Courses list and mock assigned view
    const { fetchCourses } = await import('./coursesApi.js')
    const courses = await fetchCourses()
    return courses.map(c => ({
      id: c.id,
      title: c.title,
      desc: c.desc || c.description,
      status: c.status || 'not_started',
      progress: c.progress || 0,
      score: c.score || null,
      image: c.image || 'bx-book'
    }))
  }
}

export async function saveLearnerProgress(courseId, updates) {
  const user = getCurrentUserSync();
  if (!user) return;

  if (supabase) {
    const progressObj = {
      progress_percent: updates.progress,
      status: updates.status,
      time_spent_seconds: updates.time, // Add to existing optionally
      last_accessed: new Date().toISOString()
    };
    if (updates.status === 'completed') progressObj.completed_at = new Date().toISOString();
    
    // Upsert logic for learner_progress based on unique user_id + course_id
    const { error } = await supabase
      .from('learner_progress')
      .upsert({
        user_id: user.id,
        course_id: courseId,
        org_id: user.orgId,
        ...progressObj
      }, { onConflict: 'user_id, course_id' });
    
    if (error) console.error("Error saving progress:", error.message);
  } else {
    // Mock update locally...
    console.log("Mock progress saved:", user.id, courseId, updates);
  }
}
