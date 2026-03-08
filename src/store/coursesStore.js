let courses = [
  { id: 'c1', title: 'הדרכת אבטחת מידע בארגון - Q1', desc: 'לומדת חובה לכלל עובדי החברה', category: 'אבטחת מידע', status: 'completed', score: 100, progress: 100, image: 'bx-shield-quarter', created_at: '01/01/2026', published: true },
  { id: 'c2', title: 'הכרה ושימוש ב-AI בעבודה', desc: 'כלים מתקדמים לשיפור הפרודוקטיביות היומיומית', category: 'טכנולוגיה', status: 'in_progress', score: null, progress: 45, image: 'bx-brain', created_at: '15/02/2026', published: true },
  { id: 'c3', title: 'נהלי בטיחות ותקנון משרד (האב 2)', desc: 'רענון שנתי על נהלי הצטרפות למשרדים', category: 'משאבי אנוש', status: 'not_started', score: null, progress: 0, image: 'bx-buildings', created_at: '10/01/2026', published: true },
]

export function getCourses() {
  return [...courses];
}

export function addCourse(course) {
  courses.push(course);
}

export function deleteCourse(id) {
  courses = courses.filter(c => c.id !== id);
}

export function updateCourse(id, updates) {
  courses = courses.map(c => c.id === id ? { ...c, ...updates } : c);
}
