import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'
import JSZip from 'https://esm.sh/jszip'

let MOCK_COURSES = [
  { id: 'c1', title: 'הדרכת אבטחת מידע בארגון - Q1', desc: 'לומדת חובה לכלל עובדי החברה', category: 'אבטחת מידע', status: 'completed', score: 100, progress: 100, image: 'bx-shield-quarter', created_at: '01/01/2026', published: true, org_id: 'org-2' },
  { id: 'c2', title: 'הכרה ושימוש ב-AI בעבודה', desc: 'כלים מתקדמים לשיפור הפרודוקטיביות היומיומית', category: 'טכנולוגיה', status: 'in_progress', score: null, progress: 45, image: 'bx-brain', created_at: '15/02/2026', published: true, org_id: 'org-2' },
  { id: 'c3', title: 'נהלי בטיחות ותקנון משרד (האב 2)', desc: 'רענון שנתי על נהלי הצטרפות למשרדים', category: 'משאבי אנוש', status: 'not_started', score: null, progress: 0, image: 'bx-buildings', created_at: '10/01/2026', published: true, org_id: 'org-2' }
]

export async function fetchCourses() {
  const user = getCurrentUserSync();
  if (!user) throw new Error("לא מחובר");

  if (supabase) {
    if (user.role === 'super_admin') {
      const { data, error } = await supabase.from('courses').select('*');
      if (error) throw new Error(error.message);
      return data;
    } 
    
    // For non-super admins (Org Admin and Learner), orgId is required
    const effectiveOrgId = user.orgId || user.org_id;
    if (!effectiveOrgId) {
        console.warn(`[LMS] fetchCourses - Missing orgId for user ${user.id} (${user.role})`);
        return [];
    }

    if (user.role === 'org_admin') {
      const { data, error } = await supabase.from('courses').select('*').eq('org_id', effectiveOrgId);
      if (error) throw new Error(error.message);
      return data;
    } else {
      // Learner fetches from assignments, handled via progress/assignments API usually
      // For simplicity, fetch published
      const { data, error } = await supabase.from('courses').select('*').eq('org_id', effectiveOrgId).eq('published', true);
      if (error) throw new Error(error.message);
      return data;
    }
  } else {
    const effectiveOrgId = user.orgId || user.org_id;
    if (user.role === 'super_admin') return [...MOCK_COURSES];
    return MOCK_COURSES.filter(c => c.org_id === effectiveOrgId);
  }
}

export async function uploadCourse(courseData, file) {
  const user = getCurrentUserSync();
  if (!user || (user.role !== 'org_admin' && user.role !== 'super_admin')) throw new Error("אין הרשאה");

  if (supabase) {
    const courseId = crypto.randomUUID();
    let effectiveOrgId = user.orgId || user.org_id;

    // Hotfix for Super Admin with no associated orgId
    if (!effectiveOrgId && user.role === 'super_admin') {
        try {
            const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
            if (orgs && orgs.length > 0) effectiveOrgId = orgs[0].id;
        } catch (e) {
            console.error("[LMS] Failed to fetch fallback organization", e);
        }
    }

    if (!effectiveOrgId) throw new Error("לא נמצא מזהה ארגון לשיוך הלומדה. אנא וודא שהפרופיל שלך משוייך לארגון.");

    const folderPath = `org_${effectiveOrgId}/courses/${courseId}`;
    let entryPoint = 'index.html';

    // 1. Unzip the file
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    const files = Object.keys(contents.files);
    
    const fileMap = [];
    files.forEach(name => {
        if (contents.files[name].dir) return;
        const safeName = name.split('/').map(part => part.replace(/[^a-zA-Z0-9._-]/g, '_')).join('/');
        fileMap.push({ original: name, safe: safeName });
    });

    // 2. Upload files
    const uploadPromises = fileMap.map(async (mapping) => {
      const { original, safe } = mapping;
      const fileObj = contents.files[original];
      let blob = await fileObj.async('blob');
      let contentType = getContentType(original);
      
      if (['text/html', 'application/javascript', 'text/css', 'application/xml', 'application/json'].includes(contentType)) {
          let text = await fileObj.async('text');
          fileMap.forEach(m => {
              if (m.original !== m.safe) {
                 const baseOrig = m.original.split('/').pop();
                 const baseSafe = m.safe.split('/').pop();
                 text = text.split(m.original).join(m.safe);
                 if (baseOrig !== baseSafe) text = text.split(baseOrig).join(baseSafe);
              }
          });
          blob = new Blob([text], { type: contentType });
      }

      if (original.toLowerCase().endsWith('index.html') || original.toLowerCase().endsWith('story.html')) {
          entryPoint = safe;
      }

      await supabase.storage.from('scorm_packages').upload(`${folderPath}/${safe}`, blob, { contentType, upsert: true });
    });

    await Promise.all(uploadPromises);

    // 3. Save Course Data
    // We try both 'desc' and 'description' to be extremely robust against schema variations
    const payload = {
        id: courseId,
        org_id: effectiveOrgId,
        title: courseData.title,
        category: courseData.category,
        published: true,
        entry_point: entryPoint
    };

    // The logic below handles the discrepancy between 'desc' or 'description' columns
    // We attempt 'description' first as it's more standard, but code often uses 'desc'
    payload.description = courseData.description || courseData.desc;
    
    console.log("[LMS] Attempting course insert with payload:", payload);

    const { data: course, error: insertError } = await supabase
      .from('courses')
      .insert([payload])
      .select()
      .single();

    if (insertError) {
      console.error("[LMS] Course insert failed. Attempting fallback to 'desc' column...", insertError);
      
      // Fallback: If 'description' failed, trial with 'desc'
      delete payload.description;
      payload.desc = courseData.description || courseData.desc;
      
      const { data: retryData, error: retryError } = await supabase
        .from('courses')
        .insert([payload])
        .select()
        .single();
        
      if (retryError) {
          console.error("[LMS] CRITICAL: Both 'description' and 'desc' inserts failed.", retryError);
          throw new Error(`שגיאה בשמירת נתוני הקורס: ${retryError.message}`);
      }
      return retryData;
    }

    // 4. Save Folder Reference
    await supabase.from('course_files').insert([{
      course_id: course.id,
      file_path: folderPath
    }]);

    return course;
  }
}

function getContentType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const map = {
        'html': 'text/html',
        'htm': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'json': 'application/json',
        'xml': 'application/xml',
        'mp4': 'video/mp4',
        'pdf': 'application/pdf'
    };
    return map[ext] || 'application/octet-stream';
}

export async function deleteCourse(id) {
  if (supabase) {
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    MOCK_COURSES = MOCK_COURSES.filter(c => c.id !== id);
  }
}

export async function fetchCourseById(id) {
  if (supabase) {
    // Using limit(1) instead of single() to avoid 406 errors when schema cache is stale
    const { data: results, error } = await supabase
      .from('courses')
      .select('*, course_files(file_path)')
      .eq('id', id)
      .limit(1);
    
    if (error) throw new Error(error.message);
    const data = results[0];
    if (!data) return null;
    
    // Construct the direct URL to the index/story file
    if (data.course_files && data.course_files.length > 0) {
      const entryPath = `${data.course_files[0].file_path}/${data.entry_point || 'index.html'}`;
      const { data: urlData } = supabase.storage
        .from('scorm_packages')
        .getPublicUrl(entryPath);
      data.fileUrl = urlData.publicUrl;
      console.log(`[LMS] Course file URL generated: ${data.fileUrl}`);
    } else {
      console.warn(`[LMS] No course_files found for course ${id}. Relation data:`, data.course_files);
    }
    
    return data;
  } else {
    return MOCK_COURSES.find(c => c.id === id);
  }
}
