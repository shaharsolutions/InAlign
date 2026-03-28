import { uploadCourse, deleteCourse, fetchCourses } from '../api/coursesApi.js'
import { fetchCategories } from '../api/categoriesApi.js'
import { showConfirmModal, showToast } from '../lib/ui.js'

export default async function renderAdminScorm(container) {
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">ניהול והעלאת לומדות (SCORM)</h1>
      <p class="text-muted">ניהול קטלוג ההדרכות, העלאת קבצי ZIP ופרסומם במערכת</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 2rem; align-items: start;">
       <!-- Form Section -->
       <div class="card" style="grid-column: span 1;">
         <h3 class="mb-3">העלאת לומדה חדשה</h3>
         <form id="scorm-upload-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="course-title">שם הלומדה <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="course-title" required placeholder="לדוגמה: מניעת הטרדה מינית 2026">
            </div>
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
               <label class="form-label" for="course-file">קובץ SCORM (ZIP) <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="file" id="course-file" accept=".zip" required>
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-cloud-upload'></i> העלה ופרסם לומדה
            </button>
            <div id="upload-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <h3 class="mb-3">לומדות במערכת</h3>
         <table class="table" id="courses-table">
            <thead>
               <tr>
                  <th>שם הלומדה</th>
                  <th>קטגוריה</th>
                  <th>סטטוס</th>
                  <th>תאריך יצירה</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="5" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען לומדות...</td></tr>
            </tbody>
         </table>
       </div>
    </div>
  `

  const tableBody = container.querySelector('#courses-table tbody')
  const categorySelect = container.querySelector('#course-category')

  async function loadCategories() {
    try {
      const categories = await fetchCategories()
      if (categories.length > 0) {
        categorySelect.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')
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
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">אין לומדות במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = courses.map(c => `
        <tr>
           <td><div style="font-weight: 500;">${c.title}</div></td>
           <td><span class="badge badge-primary">${c.category || 'כללי'}</span></td>
           <td><span class="badge ${c.published ? 'badge-success' : 'badge-warning'}">${c.published ? 'מפורסם' : 'טיוטה'}</span></td>
           <td>${new Date(c.created_at).toLocaleDateString('he-IL')}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm" onclick="window.location.hash = '#/player?id=${c.id}'" title="תצוגה מקדימה"><i class='bx bx-play'></i></button>
               <button class="btn btn-outline text-sm delete-btn" data-id="${c.id}" data-title="${c.title}" title="מחק"><i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i></button>
             </div>
           </td>
        </tr>
      `).join('')

      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const title = e.currentTarget.getAttribute('data-title');
          
          await showConfirmModal({
            title: 'מחיקת לומדה',
            message: `האם אתה בטוח שברצונך למחוק את הלומדה <strong>${title}</strong>? כל נתוני ההתקדמות של המשתמשים יימחקו לצמיתות.`,
            confirmText: 'מחק לצמיתות',
            onConfirm: async () => {
                await deleteCourse(id);
                showToast('הלומדה נמחקה בהצלחה');
                renderTable();
            }
          });
        })
      })
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה: ${err.message}</td></tr>`
    }
  }

  await loadCategories()
  await renderTable()

  const form = container.querySelector('#scorm-upload-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fileInput = document.getElementById('course-file')
    const file = fileInput.files[0]
    const msg = document.getElementById('upload-msg')
    
    if (!file || !file.name.toLowerCase().endsWith('.zip')) {
      showToast('נא להעלות קובץ ZIP תקני', 'error');
      return
    }

    const courseData = {
      title: document.getElementById('course-title').value,
      description: document.getElementById('course-desc').value,
      category: document.getElementById('course-category').value
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מעלה...`
    
    try {
      await uploadCourse(courseData, file)
      showToast('הלומדה הועלתה בהצלחה');
      await renderTable()
      form.reset()
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = `<i class='bx bx-cloud-upload'></i> העלה ופרסם לומדה`
    }
  })
}
