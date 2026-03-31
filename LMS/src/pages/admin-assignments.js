import { fetchCourseAssignments, assignCourseToOrg, unassignCourse } from '../api/assignmentApi.js'
import { fetchOrganizations } from '../api/orgApi.js'
import { fetchCourses } from '../api/coursesApi.js'

export default async function renderAdminAssignments(container) {
  
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">הקצאת לומדות לארגונים</h1>
      <p class="text-muted">שיוך לומדות מקטלוג המערכת לארגונים השונים</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 2rem; align-items: start;">
       <!-- Form Section -->
       <div class="card" style="grid-column: span 1;">
         <h3 class="mb-3">ביצוע הקצאה חדשת</h3>
         <form id="assignment-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="select-target">בחר ארגון <span style="color: hsl(var(--color-danger));">*</span></label>
               <select class="form-control" id="select-target" required>
                  <option value="">טוען ארגונים...</option>
               </select>
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="select-course">בחר לומדה להקצאה <span style="color: hsl(var(--color-danger));">*</span></label>
               <select class="form-control" id="select-course" required>
                  <option value="">טוען לומדות...</option>
               </select>
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-book-add'></i> הקצה לומדה לארגון
            </button>
            <div id="assignment-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <h3 class="mb-3">לומדות שהוקצו לארגונים</h3>
         <table class="table" id="assignments-table">
            <thead>
               <tr>
                  <th>שם הארגון</th>
                  <th>לומדה</th>
                  <th>תאריך הקצאה</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="4" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען הקצאות...</td></tr>
            </tbody>
         </table>
       </div>
    </div>
  `

  const selectTarget = container.querySelector('#select-target');
  const selectCourse = container.querySelector('#select-course');
  const tbody = container.querySelector('#assignments-table tbody');

  // Fetch combo boxes data
  async function loadComboBoxes() {
    try {
        const [targets, courses] = await Promise.all([
            fetchOrganizations(),
            fetchCourses()
        ]);
        
        selectTarget.innerHTML = targets.length === 0 
           ? '<option value="">לא נמצאו ארגונים</option>'
           : `<option value="">-- בחר ארגון יעד --</option>` + targets.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
           
        selectCourse.innerHTML = courses.length === 0 
           ? '<option value="">אין לומדות זמינות</option>'
           : `<option value="">-- בחר הדרכה --</option>` + courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('');

    } catch(err) {
        selectTarget.innerHTML = `<option value="">שגיאה בטעינה</option>`;
        selectCourse.innerHTML = `<option value="">שגיאה בטעינה</option>`;
    }
  }

  // Load Main Table
  async function renderTable() {
    try {
      const records = await fetchCourseAssignments();
      if(records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center">אין הקצאות להצגה</td></tr>`;
        return;
      }

      tbody.innerHTML = records.map(r => `
        <tr>
          <td><div style="font-weight: 500;">${r.target_name || 'נמחק'}</div></td>
          <td>${r.course_title || 'נמחק'}</td>
          <td>${r.assigned_at || '-'}</td>
          <td>
             <button class="btn btn-outline text-sm delete-btn" data-id="${r.id}" title="בטל הקצאה"><i class='bx bx-unlink' style="color: hsl(var(--color-danger));"></i></button>
          </td>
        </tr>
      `).join('');

      // Add delete listeners
      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const assignmentId = e.currentTarget.getAttribute('data-id');
            const btn = e.currentTarget;
            const msg = document.getElementById('assignment-msg');
            
            if (btn.classList.contains('confirming')) {
                btn.innerHTML = `<i class='bx bx-loader bx-spin'></i>`;
                try {
                    await unassignCourse(assignmentId);
                    msg.style.color = 'hsl(var(--color-success))';
                    msg.innerHTML = 'ההקצאה הוסרה בהצלחה!';
                    setTimeout(() => msg.innerHTML='', 3000);
                    await renderTable();
                } catch(err) {
                    msg.style.color = 'hsl(var(--color-danger))';
                    msg.innerHTML = 'שגיאה בהסרת הקצאה: ' + err.message;
                    setTimeout(() => msg.innerHTML='', 4000);
                    await renderTable();
                }
            } else {
                btn.classList.add('confirming');
                btn.innerHTML = `לחץ שוב לאישור מחיקה \u26A0`;
                btn.classList.remove('btn-outline');
                btn.classList.add('btn-danger');
                
                setTimeout(() => {
                    if(document.body.contains(btn)) {
                        btn.classList.remove('confirming');
                        btn.innerHTML = `<i class='bx bx-unlink' style='color: hsl(var(--color-danger));'></i>`;
                        btn.classList.add('btn-outline');
                        btn.classList.remove('btn-danger');
                    }
                }, 3000);
            }
        });
      });
    } catch(err) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:red;text-align:center;">שגיאה: ${err.message}</td></tr>`;
    }
  }

  await loadComboBoxes();
  await renderTable();

  // Handle Form Submission
  const form = container.querySelector('#assignment-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const msg = document.getElementById('assignment-msg');
    const courseId = selectCourse.value;
    const targetId = selectTarget.value;

    if(!courseId || !targetId) return;

    btn.disabled = true;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שומר...`;

    try {
        await assignCourseToOrg(courseId, targetId);
        msg.style.color = 'hsl(var(--color-success))';
        msg.innerHTML = 'הלומדה שויכה לארגון בהצלחה!';
        await renderTable();
    } catch(err) {
        msg.style.color = 'hsl(var(--color-danger))';
        msg.innerHTML = err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class='bx bx-book-add'></i> הקצה לומדה לארגון`;
        setTimeout(() => msg.innerHTML='', 3000);
    }
  });

}
