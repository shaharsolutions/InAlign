import { fetchCourses } from './coursesApi.js';
import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_ASSIGNMENTS = [
  { id: 'asg-1', user_id: 'usr-3', course_id: 'c1', org_id: 'org-2' },
  { id: 'asg-2', user_id: 'usr-2', course_id: 'c2', org_id: 'org-2' }
];

// Helper to fetch users in the org
export async function fetchOrgLearners() {
  const user = getCurrentUserSync();
  if (!user || user.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('org_id', user.orgId)
      .eq('role', 'learner'); // Fetch learners only

    if (error) throw new Error(error.message);
    return data;
  } else {
    // Return mock users for the same org
    return [
      { id: 'usr-3', full_name: 'ישראל הלומד ציבורי', role: 'learner' },
      { id: 'usr-4', full_name: 'דינה כהן - מוקד', role: 'learner' }
    ];
  }
}

export async function fetchCourseAssignments() {
    const user = getCurrentUserSync();
    if (!user || user.role !== 'org_admin') throw new Error("אין הרשאה");

    if(supabase) {
        const {data, error} = await supabase
            .from('course_assignments')
            .select(`
                id, assigned_at,
                courses (id, title),
                profiles (id, full_name)
            `)
            .eq('org_id', user.orgId);
        
        if(error) throw new Error(error.message);
        
        return data.map(record => ({
            id: record.id,
            course_title: record.courses?.title,
            learner_name: record.profiles?.full_name,
            assigned_at: new Date(record.assigned_at).toLocaleDateString('he-IL')
        }));
    } else {
        const courses = await fetchCourses();
        const learners = await fetchOrgLearners();
        
        return MOCK_ASSIGNMENTS.map(asg => {
            const course = courses.find(c => c.id === asg.course_id);
            const learner = learners.find(l => l.id === asg.user_id) || {full_name: 'משתמש לא ידוע'};
            return {
                id: asg.id,
                course_title: course?.title || 'לומדה חסרה',
                learner_name: learner.full_name,
                assigned_at: '10/01/2026'
            }
        });
    }
}

export async function assignCourseToLearner(courseId, learnerId) {
  const user = getCurrentUserSync();
  if (!user || user.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    const { error } = await supabase.from('course_assignments').insert([{
      org_id: user.orgId,
      course_id: courseId,
      user_id: learnerId
    }]);

    // Handle "Already assigned" scenario gracefully (unique constraint)
    if (error) {
       if (error.code === '23505') throw new Error('לומדה זו כבר מוקצית למשתמש זה.');
       throw new Error(error.message);
    }
  } else {
    // Mock
    if (MOCK_ASSIGNMENTS.find(a => a.course_id === courseId && a.user_id === learnerId)) {
        throw new Error('לומדה זו כבר מוקצית למשתמש זה.');
    }
    MOCK_ASSIGNMENTS.push({
      id: 'asg-' + Date.now().toString().slice(-4),
      user_id: learnerId,
      course_id: courseId,
      org_id: user.org_id
    });
  }
}

export async function unassignCourse(assignmentId) {
    if(supabase) {
       const {error} = await supabase.from('course_assignments').delete().eq('id', assignmentId);
       if(error) throw new Error(error.message);
    } else {
       MOCK_ASSIGNMENTS = MOCK_ASSIGNMENTS.filter(a => a.id !== assignmentId);
    }
}
