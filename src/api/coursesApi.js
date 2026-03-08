import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'

let MOCK_COURSES = [
  { id: 'c1', title: 'הדרכת אבטחת מידע בארגון - Q1', desc: 'לומדת חובה לכלל עובדי החברה', category: 'אבטחת מידע', status: 'completed', score: 100, progress: 100, image: 'bx-shield-quarter', created_at: '01/01/2026', published: true, org_id: 'org-2' },
  { id: 'c2', title: 'הכרה ושימוש ב-AI בעבודה', desc: 'כלים מתקדמים לשיפור הפרודוקטיביות היומיומית', category: 'טכנולוגיה', status: 'in_progress', score: null, progress: 45, image: 'bx-brain', created_at: '15/02/2026', published: true, org_id: 'org-2' },
  { id: 'c3', title: 'נהלי בטיחות ותקנון משרד (האב 2)', desc: 'רענון שנתי על נהלי הצטרפות למשרדים', category: 'משאבי אנוש', status: 'not_started', score: null, progress: 0, image: 'bx-buildings', created_at: '10/01/2026', published: true, org_id: 'org-2' }
]

export async function fetchCourses() {
  const user = getCurrentUserSync();
  if (!user) throw new Error("לא מחובר");

  if (supabase) {
    if (user.role === 'org_admin') {
      const { data, error } = await supabase.from('courses').select('*').eq('org_id', user.orgId);
      if (error) throw new Error(error.message);
      return data;
    } else {
      // Learner fetches from assignments, handled via progress/assignments API usually
      // For simplicity, fetch published
      const { data, error } = await supabase.from('courses').select('*').eq('org_id', user.orgId).eq('published', true);
      if (error) throw new Error(error.message);
      return data;
    }
  } else {
    return MOCK_COURSES.filter(c => c.org_id === user.org_id);
  }
}

export async function uploadCourse(courseData, file) {
  const user = getCurrentUserSync();
  if (!user || user.role !== 'org_admin') throw new Error("אין הרשאה");

  if (supabase) {
    const filePath = `org_${user.orgId}/courses/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('scorm_packages').upload(filePath, file);
    if (uploadError) throw new Error('שגיאה בהעלאת קובץ: ' + uploadError.message);

    const { data: course, error: insertError } = await supabase
      .from('courses')
      .insert([{
        org_id: user.orgId,
        title: courseData.title,
        description: courseData.description,
        category: courseData.category,
        published: true
      }])
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    await supabase.from('course_files').insert([{
      course_id: course.id,
      file_path: filePath
    }]);

    return course;
  } else {
    const newCourse = {
      id: 'c' + Date.now().toString().slice(-6),
      title: courseData.title,
      desc: courseData.description,
      category: courseData.category,
      image: 'bx-file', // default mockup
      created_at: new Date().toLocaleDateString('he-IL'),
      published: true,
      org_id: user.org_id,
      status: 'not_started',
      progress: 0,
    }
    MOCK_COURSES.push(newCourse);
    return newCourse;
  }
}

export async function deleteCourse(id) {
  if (supabase) {
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    MOCK_COURSES = MOCK_COURSES.filter(c => c.id !== id);
  }
}
