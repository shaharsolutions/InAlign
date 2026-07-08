import { getCourseContentLabel, getContentTypeMeta, uploadCourse, deleteCourse, fetchCourses, updateCourseGuestAccess } from '../api/coursesApi.js'
import { fetchCategories } from '../api/categoriesApi.js'
import { escapeAttr, escapeHtml } from '../lib/html.js'
import { showConfirmModal, showToast } from '../lib/ui.js'

export default async function renderAdminScorm(container) {
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">ניהול והעלאת תוכן למידה</h1>
      <p class="text-muted">ניהול קטלוג ההדרכות, העלאת לומדות SCORM, סרטונים, מצגות וקבצי PDF</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: var(--gap-standard); align-items: start;">
       <!-- Form Section -->
       <div class="card" style="grid-column: 1 / -1;">
         <h3 class="mb-3">העלאת תוכן למידה חדש</h3>
         <form id="scorm-upload-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="course-title">שם התוכן <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="course-title" required placeholder="לדוגמה: מניעת הטרדה מינית 2026">
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="course-content-type">סוג תוכן <span style="color: hsl(var(--color-danger));">*</span></label>
               <select class="form-control" id="course-content-type" required>
                  <option value="scorm">לומדה (ZIP)</option>
                  <option value="video">סרטון</option>
                  <option value="presentation">מצגת</option>
                  <option value="pdf">קובץ PDF</option>
               </select>
            </div>
            <label class="card flex items-center gap-3" style="padding:1rem;cursor:pointer;box-shadow:none;margin-top:1rem">
              <input type="checkbox" id="course-guest-access" style="width:18px;height:18px">
              <span>
                <strong>אפשר כניסה ללא שם משתמש וסיסמה</strong>
                <span class="text-sm text-muted" style="display:block">ייווצר קישור שבו הלומד מזין שם מלא ומספר טלפון.</span>
              </span>
            </label>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="course-desc">תיאור קצר</label>
               <textarea class="form-control" id="course-desc" rows="3" placeholder="תקציר של תוכן ההדרכה..."></textarea>
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="course-category">קטגוריה</label>
               <select class="form-control" id="course-category">
                  <option value="כללי">טוען קטגוריות...</option>
               </select>
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="course-file" id="course-file-label">קובץ SCORM (ZIP) <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="file" id="course-file" accept=".zip" required>
               <p class="text-muted text-sm" id="course-file-help" style="margin: 0.5rem 0 0;">
                 מומלץ להעלות לומדה מסוג SCORM 1.2, כקובץ ZIP יחיד בפורמט HTML5. לומדות SCORM 2004 פשוטות עשויות לפעול, אך התמיכה בהן חלקית.
               </p>
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-cloud-upload'></i> העלה ופרסם תוכן
            </button>
            <div id="upload-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Table Section -->
       <div class="card table-wrapper" style="grid-column: 1 / -1;">
         <h3 class="mb-3">תוכן למידה במערכת</h3>
         <table class="table" id="courses-table">
            <thead>
               <tr>
                  <th>שם התוכן</th>
                  <th>סוג</th>
                  <th>קטגוריה</th>
                  <th>סטטוס</th>
                  <th>גישת אורחים</th>
                  <th>תאריך יצירה</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="7" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען תוכן למידה...</td></tr>
            </tbody>
         </table>
       </div>
    </div>
  `

  const tableBody = container.querySelector('#courses-table tbody')
  const categorySelect = container.querySelector('#course-category')
  const contentTypeSelect = container.querySelector('#course-content-type')
  const fileInput = container.querySelector('#course-file')
  const fileLabel = container.querySelector('#course-file-label')
  const fileHelp = container.querySelector('#course-file-help')

  const FILE_HELP = {
    scorm: 'מומלץ להעלות לומדה מסוג SCORM 1.2, כקובץ ZIP יחיד בפורמט HTML5. לומדות SCORM 2004 פשוטות עשויות לפעול, אך התמיכה בהן חלקית.',
    video: 'ניתן להעלות סרטוני MP4, WebM, MOV או M4V. הצפייה וזמן השימוש יתועדו בדוחות המנהלים.',
    presentation: 'ניתן להעלות מצגות PPT, PPTX, PPS, PPSX או Keynote. אם הדפדפן אינו מציג את המצגת, הלומד יקבל פתיחה/הורדה והמערכת תתעד שימוש.',
    pdf: 'ניתן להעלות קובץ PDF. פתיחה, זמן צפייה וסימון השלמה יתועדו בדוחות המנהלים.'
  }

  function updateFileField() {
    const selectedType = contentTypeSelect.value
    const meta = getContentTypeMeta(selectedType)
    fileInput.value = ''
    fileInput.accept = meta.extensions.map(ext => `.${ext}`).join(',')
    fileLabel.innerHTML = `${meta.label} <span style="color: hsl(var(--color-danger));">*</span>`
    fileHelp.textContent = FILE_HELP[selectedType] || ''
  }

  async function loadCategories() {
    try {
      const categories = await fetchCategories()
      const uniqueCategories = [];
      const seenNames = new Set();
      categories.forEach(c => {
        if (!seenNames.has(c.name)) {
          seenNames.add(c.name);
          uniqueCategories.push(c);
        }
      });

      if (uniqueCategories.length > 0) {
        categorySelect.innerHTML = uniqueCategories.map(c => `<option value="${escapeAttr(c.name)}">${escapeHtml(c.name)}</option>`).join('')
      } else {
        categorySelect.innerHTML = `<option value="כללי">כללי</option>`
      }
    } catch (err) {
      console.error('Failed to load categories:', err)
      categorySelect.innerHTML = `<option value="כללי">כללי (שגיאה בטעינה)</option>`
    }
  }

  async function renderTable() {
    try {
      const courses = await fetchCourses()
      if (courses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;" class="text-muted">אין תוכן למידה במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = courses.map(c => `
        <tr>
           <td><div style="font-weight: 500;">${escapeHtml(c.title)}</div></td>
           <td><span class="badge badge-primary">${escapeHtml(getCourseContentLabel(c))}</span></td>
           <td><span class="badge badge-primary">${escapeHtml(c.category || 'כללי')}</span></td>
           <td><span class="badge ${c.published ? 'badge-success' : 'badge-warning'}">${c.published ? 'מפורסם' : 'טיוטה'}</span></td>
           <td>
             <div class="flex items-center gap-2">
               <button class="btn btn-outline text-sm guest-toggle-btn" data-id="${escapeAttr(c.id)}" data-enabled="${c.guest_access_enabled === true}">
                 <i class='bx ${c.guest_access_enabled ? 'bx-user-check' : 'bx-user-x'}'></i>
                 ${c.guest_access_enabled ? 'פעיל' : 'כבוי'}
               </button>
               ${c.guest_access_enabled && c.guest_access_token ? `
                 <button class="btn btn-outline text-sm copy-guest-link-btn" data-token="${escapeAttr(c.guest_access_token)}" title="העתק קישור כניסה לאורחים">
                   <i class='bx bx-copy'></i>
                 </button>
               ` : ''}
             </div>
           </td>
           <td>${new Date(c.created_at).toLocaleDateString('he-IL')}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm preview-btn" data-id="${escapeAttr(c.id)}" title="תצוגה מקדימה"><i class='bx bx-play'></i></button>
               <button class="btn btn-outline text-sm delete-btn" data-id="${escapeAttr(c.id)}" data-title="${escapeAttr(c.title)}" title="מחק"><i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i></button>
             </div>
           </td>
        </tr>
      `).join('')

      container.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
          window.location.hash = `#/player?id=${encodeURIComponent(event.currentTarget.dataset.id)}`
        })
      })

      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const title = e.currentTarget.getAttribute('data-title');
          
          await showConfirmModal({
            title: 'מחיקת תוכן למידה',
            message: `האם אתה בטוח שברצונך למחוק את התוכן <strong>${escapeHtml(title)}</strong>? כל נתוני ההתקדמות והשימוש של המשתמשים יימחקו לצמיתות.`,
            confirmText: 'מחק לצמיתות',
            onConfirm: async () => {
                await deleteCourse(id);
                showToast('התוכן נמחק בהצלחה');
                renderTable();
            }
          });
        })
      })

      container.querySelectorAll('.guest-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async (event) => {
          const button = event.currentTarget
          const enabled = button.dataset.enabled === 'true'
          button.disabled = true
          try {
            await updateCourseGuestAccess(button.dataset.id, !enabled)
            showToast(!enabled ? 'גישת אורחים הופעלה' : 'גישת אורחים כובתה')
            await renderTable()
          } catch (error) {
            showToast(error.message, 'error')
            button.disabled = false
          }
        })
      })

      container.querySelectorAll('.copy-guest-link-btn').forEach(btn => {
        btn.addEventListener('click', async (event) => {
          const baseUrl = window.location.href.split('#')[0]
          const link = `${baseUrl}#/guest?code=${event.currentTarget.dataset.token}`
          await navigator.clipboard.writeText(link)
          showToast('קישור הכניסה לאורחים הועתק')
        })
      })
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה: ${err.message}</td></tr>`
    }
  }

  await loadCategories()
  updateFileField()
  await renderTable()
  contentTypeSelect.addEventListener('change', updateFileField)

  const form = container.querySelector('#scorm-upload-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const file = fileInput.files[0]
    const msg = document.getElementById('upload-msg')

    if (!file) {
      showToast('נא לבחור קובץ להעלאה', 'error');
      return
    }

    const courseData = {
      title: document.getElementById('course-title').value,
      description: document.getElementById('course-desc').value,
      category: document.getElementById('course-category').value,
      contentType: contentTypeSelect.value,
      guestAccessEnabled: document.getElementById('course-guest-access').checked
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מעלה...`
    msg.textContent = 'מעלה ומפרסם תוכן למידה. נתוני פתיחה, זמן שימוש והשלמה יופיעו בדוחות המנהלים.'
    msg.style.color = 'hsl(var(--color-muted))'
    
    try {
      await uploadCourse(courseData, file)
      showToast('התוכן הועלה בהצלחה');
      msg.textContent = 'התוכן הועלה ופורסם בהצלחה. מומלץ לפתוח תצוגה מקדימה ולבדוק שהשימוש נרשם בדוח.'
      msg.style.color = 'hsl(var(--color-success))'
      await renderTable()
      form.reset()
      updateFileField()
    } catch (err) {
      showToast(err.message, 'error');
      msg.textContent = `שגיאה בהעלאת התוכן: ${err.message}`
      msg.style.color = 'hsl(var(--color-danger))'
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = `<i class='bx bx-cloud-upload'></i> העלה ופרסם תוכן`
    }
  })
}
