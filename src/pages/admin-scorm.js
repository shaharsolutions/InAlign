import { uploadCourse, deleteCourse, fetchCourses } from '../api/coursesApi.js'

export default async function renderAdminScorm(container) {
  // We use async render because we need to fetch courses from real DB
  
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">ניהול והעלאת לומדות (SCORM)</h1>
      <p class="text-muted">ניהול קטלוג ההדרכות, העלאת קבצי ZIP ופרסומם במערכת</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 1.5rem; align-items: start;">
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
                  <option value="כללי">כללי</option>
                  <option value="אבטחת מידע">אבטחת מידע</option>
                  <option value="משאבי אנוש">משאבי אנוש</option>
                  <option value="טכנולוגיה">טכנולוגיה</option>
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

  async function renderTable() {
    try {
      const courses = await fetchCourses()
      if (courses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">אין לומדות במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = courses.map(c => `
        <tr>
           <td>
              <div style="font-weight: 500;">${c.title}</div>
           </td>
           <td><span class="badge badge-primary">${c.category || 'כללי'}</span></td>
           <td><span class="badge ${c.published ? 'badge-success' : 'badge-warning'}">${c.published ? 'מפורסם' : 'טיוטה'}</span></td>
           <td>${new Date(c.created_at).toLocaleDateString('he-IL')}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm" onclick="window.location.hash = '#/player?id=${c.id}'" title="תצוגה מקדימה"><i class='bx bx-play'></i></button>
               <button class="btn btn-outline text-sm delete-btn" data-id="${c.id}" title="מחק"><i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i></button>
             </div>
           </td>
        </tr>
      `).join('')

      // Append delete event listeners
      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id')
          const btn = e.currentTarget;
          
          if (btn.classList.contains('confirming')) {
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i>`
            try {
                await deleteCourse(id)
                renderTable() // refresh table
            } catch(err) {
                btn.innerHTML = 'שגיאה';
                setTimeout(() => renderTable(), 2000);
            }
          } else {
            btn.classList.add('confirming');
            btn.innerHTML = `אישור \u26A0`;
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-danger');
            
            setTimeout(() => {
                if (document.body.contains(btn)) {
                    btn.classList.remove('confirming');
                    btn.innerHTML = `<i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i>`;
                    btn.classList.add('btn-outline');
                    btn.classList.remove('btn-danger');
                }
            }, 3000);
          }
        })
      })
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה בטעינת נתונים: ${err.message}</td></tr>`
    }
  }

  // Initial table render
  await renderTable()

  // Handle form upload
  const form = container.querySelector('#scorm-upload-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fileInput = document.getElementById('course-file')
    const file = fileInput.files[0]
    const msg = document.getElementById('upload-msg')
    
    if (!file || !file.name.toLowerCase().endsWith('.zip')) {
      msg.style.color = 'hsl(var(--color-danger))'
      msg.innerHTML = 'נא להעלות קובץ ZIP תקני בלבד'
      return
    }

    const courseData = {
      title: document.getElementById('course-title').value,
      description: document.getElementById('course-desc').value,
      category: document.getElementById('course-category').value
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מעלה נתונים מאובטחים...`
    
    try {
      await uploadCourse(courseData, file)
      await renderTable()
      
      submitBtn.disabled = false
      submitBtn.innerHTML = `<i class='bx bx-cloud-upload'></i> העלה ופרסם לומדה`
      
      msg.style.color = 'hsl(var(--color-success))'
      msg.innerHTML = 'הלומדה הועלתה ופורסמה בהצלחה בארגון שלך!'
      form.reset()
      
      setTimeout(() => { msg.innerHTML = '' }, 3000)
    } catch (err) {
      submitBtn.disabled = false
      submitBtn.innerHTML = `<i class='bx bx-cloud-upload'></i> נסה שנית`
      msg.style.color = 'hsl(var(--color-danger))'
      msg.innerHTML = 'שגיאת שרת: ' + err.message
    }
  })
}
