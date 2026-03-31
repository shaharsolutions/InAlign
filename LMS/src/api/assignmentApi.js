import { fetchCourses } from './coursesApi.js';
import { fetchOrganizations } from './orgApi.js';
import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_ASSIGNMENTS = [
  { id: 'asg-1', org_id: 'org-2', course_id: 'c1' },
];

export async function fetchCourseAssignments() {
    const user = getCurrentUserSync();
    if (!user || user.role !== 'super_admin') throw new Error("אין הרשאה");

    if(supabase) {
        const {data, error} = await supabase
            .from('course_assignments')
            .select(`
                id, assigned_at,
                courses (id, title),
                organizations (id, name)
            `);
        
        if(error) throw new Error(error.message);
        
        return data.map(record => ({
            id: record.id,
            course_title: record.courses?.title,
            target_name: record.organizations?.name,
            assigned_at: new Date(record.assigned_at).toLocaleDateString('he-IL')
        }));
    } else {
        const courses = await fetchCourses();
        const orgs = await fetchOrganizations();
        
        return MOCK_ASSIGNMENTS.map(asg => {
            const course = courses.find(c => c.id === asg.course_id);
            const org = orgs.find(o => o.id === asg.org_id) || {name: 'ארגון לא ידוע'};
            return {
                id: asg.id,
                course_title: course?.title || 'לומדה חסרה',
                target_name: org.name,
                assigned_at: '10/01/2026'
            }
        });
    }
}

export async function assignCourseToOrg(courseId, orgId) {
  const user = getCurrentUserSync();
  if (!user || user.role !== 'super_admin') throw new Error("אין הרשאה");

  if (supabase) {
    const { error } = await supabase.from('course_assignments').insert([{
      org_id: orgId,
      course_id: courseId
    }]);

    // Handle "Already assigned" scenario gracefully (unique constraint)
    if (error) {
       if (error.code === '23505') throw new Error('לומדה זו כבר מוקצית לארגון זה.');
       throw new Error(error.message);
    }
  } else {
    // Mock
    if (MOCK_ASSIGNMENTS.find(a => a.course_id === courseId && a.org_id === orgId)) {
        throw new Error('לומדה זו כבר מוקצית לארגון זה.');
    }
    MOCK_ASSIGNMENTS.push({
      id: 'asg-' + Date.now().toString().slice(-4),
      org_id: orgId,
      course_id: courseId
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
