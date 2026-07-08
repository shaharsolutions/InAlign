import { supabase } from '../lib/supabase.js'
import { getCurrentUserSync } from './authApi.js'
import { isAdminRole, isManagementRole, isSuperAdminRole } from '../lib/roles.js'
import JSZip from 'jszip'

let MOCK_COURSES = [
  { id: 'c1', title: 'הדרכת אבטחת מידע בארגון - Q1', desc: 'לומדת חובה לכלל עובדי החברה', category: 'אבטחת מידע', status: 'completed', score: 100, progress: 100, image: 'bx-shield-quarter', created_at: '01/01/2026', published: true, org_id: 'org-2', content_type: 'scorm' },
  { id: 'c2', title: 'הכרה ושימוש ב-AI בעבודה', desc: 'כלים מתקדמים לשיפור הפרודוקטיביות היומיומית', category: 'טכנולוגיה', status: 'in_progress', score: null, progress: 45, image: 'bx-brain', created_at: '15/02/2026', published: true, org_id: 'org-2', content_type: 'scorm' },
  { id: 'c3', title: 'נהלי בטיחות ותקנון משרד (האב 2)', desc: 'רענון שנתי על נהלי הצטרפות למשרדים', category: 'משאבי אנוש', status: 'not_started', score: null, progress: 0, image: 'bx-buildings', created_at: '10/01/2026', published: true, org_id: 'org-2', content_type: 'pdf' }
]

const CONTENT_TYPES = {
  scorm: {
    label: 'לומדה',
    icon: 'bx-package',
    extensions: ['zip']
  },
  video: {
    label: 'סרטון',
    icon: 'bx-video',
    extensions: ['mp4', 'webm', 'mov', 'm4v']
  },
  pdf: {
    label: 'PDF',
    icon: 'bxs-file-pdf',
    extensions: ['pdf']
  },
  presentation: {
    label: 'מצגת',
    icon: 'bx-slideshow',
    extensions: ['ppt', 'pptx', 'pps', 'ppsx', 'key']
  }
}

export function getContentTypeMeta(type) {
  return CONTENT_TYPES[type] || CONTENT_TYPES.scorm
}

export function getCourseContentType(course) {
  return course?.content_type || course?.contentType || 'scorm'
}

export function getCourseContentLabel(course) {
  return getContentTypeMeta(getCourseContentType(course)).label
}

function getFileExtension(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || ''
}

function detectContentTypeFromFile(file) {
  const ext = getFileExtension(file?.name)
  return Object.entries(CONTENT_TYPES).find(([, meta]) => meta.extensions.includes(ext))?.[0] || 'scorm'
}

function validateCourseFile(contentType, file) {
  const meta = getContentTypeMeta(contentType)
  const ext = getFileExtension(file?.name)
  if (!file || !meta.extensions.includes(ext)) {
    throw new Error(`סוג הקובץ אינו תואם ל${meta.label}. ניתן להעלות: ${meta.extensions.map(e => `.${e}`).join(', ')}`)
  }
}

function safeStorageFileName(fileName) {
  const fallback = `content-${Date.now()}`
  return String(fileName || fallback)
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '') || fallback
}

export async function fetchCourses() {
  const user = getCurrentUserSync();
  if (!user) throw new Error("לא מחובר");

  if (supabase) {
    if (isSuperAdminRole(user.role)) {
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

    if (isAdminRole(user.role)) {
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
    if (isSuperAdminRole(user.role)) return [...MOCK_COURSES];
    return MOCK_COURSES.filter(c => c.org_id === effectiveOrgId);
  }
}

export async function uploadCourse(courseData, file) {
  const user = getCurrentUserSync();
  if (!user || !isManagementRole(user.role)) throw new Error("אין הרשאה");
  const contentType = courseData.contentType || detectContentTypeFromFile(file);
  validateCourseFile(contentType, file);

  if (supabase) {
    const courseId = crypto.randomUUID();
    let effectiveOrgId = user.orgId || user.org_id;

    // Hotfix for Super Admin with no associated orgId
    if (!effectiveOrgId && isSuperAdminRole(user.role)) {
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

    if (contentType === 'scorm') {
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

      // 2. Upload SCORM package files
      const uploadPromises = fileMap.map(async (mapping) => {
        const { original, safe } = mapping;
        const fileObj = contents.files[original];
        let blob = await fileObj.async('blob');
        const mimeType = getContentType(original);

        if (['text/html', 'application/javascript', 'text/css', 'application/xml', 'application/json'].includes(mimeType)) {
            let text = await fileObj.async('text');
            fileMap.forEach(m => {
                if (m.original !== m.safe) {
                   const baseOrig = m.original.split('/').pop();
                   const baseSafe = m.safe.split('/').pop();
                   text = text.split(m.original).join(m.safe);
                   if (baseOrig !== baseSafe) text = text.split(baseOrig).join(baseSafe);
                }
            });
            blob = new Blob([text], { type: mimeType });
        }

        if (original.toLowerCase().endsWith('index.html') || original.toLowerCase().endsWith('story.html')) {
            entryPoint = safe;
        }

        await supabase.storage.from('scorm_packages').upload(`${folderPath}/${safe}`, blob, { contentType: mimeType, upsert: true });
      });

      await Promise.all(uploadPromises);
    } else {
      entryPoint = safeStorageFileName(file.name);
      await supabase.storage
        .from('scorm_packages')
        .upload(`${folderPath}/${entryPoint}`, file, { contentType: getContentType(file.name), upsert: true });
    }

    // 3. Save Course Data
    // We try both 'desc' and 'description' to be extremely robust against schema variations
    const payload = {
        id: courseId,
        org_id: effectiveOrgId,
        title: courseData.title,
        category: courseData.category,
        published: true,
        content_type: contentType,
        guest_access_enabled: courseData.guestAccessEnabled === true,
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

  const course = {
    id: crypto.randomUUID(),
    title: courseData.title,
    desc: courseData.description || courseData.desc,
    category: courseData.category,
    published: true,
    content_type: contentType,
    created_at: new Date().toISOString(),
    org_id: user.orgId || user.org_id
  }
  MOCK_COURSES.push(course)
  return course
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
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'm4v': 'video/x-m4v',
        'pdf': 'application/pdf',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pps': 'application/vnd.ms-powerpoint',
        'ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
        'key': 'application/vnd.apple.keynote'
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

export async function updateCourseGuestAccess(courseId, enabled) {
  const user = getCurrentUserSync()
  if (!user || !isManagementRole(user.role)) throw new Error("אין הרשאה")

  if (supabase) {
    const { data, error } = await supabase
      .from('courses')
      .update({ guest_access_enabled: enabled })
      .eq('id', courseId)
      .select('id, guest_access_enabled, guest_access_token')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  const course = MOCK_COURSES.find(c => c.id === courseId)
  if (course) {
    course.guest_access_enabled = enabled
    course.guest_access_token ||= crypto.randomUUID()
  }
  return course
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
    
    // Construct the authenticated proxy URL to the index/story file.
    if (data.course_files && data.course_files.length > 0) {
      const entryPath = `${data.course_files[0].file_path}/${data.entry_point || 'index.html'}`;
      data.filePath = entryPath;
      data.fileUrl = `scorm-proxy/${entryPath}`;
      data.content_type = getCourseContentType(data);
      console.log(`[LMS] Course proxy URL generated: ${data.fileUrl}`);
    } else {
      console.warn(`[LMS] No course_files found for course ${id}. Relation data:`, data.course_files);
    }
    
    return data;
  } else {
    return MOCK_COURSES.find(c => c.id === id);
  }
}
