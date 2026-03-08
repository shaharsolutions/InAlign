import { fetchOrgLearners, fetchCourseAssignments, assignCourseToLearner, unassignCourse } from '../api/assignmentApi.js'
import { fetchCourses } from '../api/coursesApi.js'

export default async function renderAdminAssignments(container) {
  
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">הקצאת לומדות לעובדים</h1>
      <p class="text-muted">שיוך וניהול גישה להדרכות עבור העובדים בארגון שלך</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 1.5rem; align-items: start;">
       <!-- Form Section -->
       <div class="card" style="grid-column: span 1;">
         <h3 class="mb-3">ביצוע הקצאה חדשה</h3>
         <form id="assignment-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="select-learner">בחר לומד <span style="color: hsl(var(--color-danger));">*</span></label>
               <select class="form-control" id="select-learner" required>
                  <option value="">טוען לומדים...</option>
               </select>
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="select-course">בחר לומדה להקצאה <span style="color: hsl(var(--color-danger));">*</span></label>
               <select class="form-control" id="select-course" required>
                  <option value="">טוען לומדות...</option>
               </select>
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-book-add'></i> הקצה לומדה
            </button>
            <div id="assignment-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <h3 class="mb-3">לומדות שהוקצו ללומדים</h3>
         <table class="table" id="assignments-table">
            <thead>
               <tr>
                  <th>שם הלומד</th>
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

  const selectLearner = container.querySelector('#select-learner');
  const selectCourse = container.querySelector('#select-course');
  const tbody = container.querySelector('#assignments-table tbody');

  // Fetch combo boxes data
  async function loadComboBoxes() {
    try {
        const [learners, courses] = await Promise.all([
            fetchOrgLearners(),
            fetchCourses()
        ]);
        
        selectLearner.innerHTML = learners.length === 0 
           ? '<option value="">לא נמצאו עובדים</option>'
           : `<option value="">-- בחר איש צוות --</option>` + learners.map(l => `<option value="${l.id}">${l.full_name}</option>`).join('');
           
        selectCourse.innerHTML = courses.length === 0 
           ? '<option value="">אין לומדות בארגון</option>'
           : `<option value="">-- בחר הדרכה --</option>` + courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('');

    } catch(err) {
        selectLearner.innerHTML = `<option value="">שגיאה בטעינה</option>`;
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
          <td><div style="font-weight: 500;">${r.learner_name || 'נמחק'}</div></td>
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
    const learnerId = selectLearner.value;

    if(!courseId || !learnerId) return;

    btn.disabled = true;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שומר...`;

    try {
        await assignCourseToLearner(courseId, learnerId);
        msg.style.color = 'hsl(var(--color-success))';
        msg.innerHTML = 'הלומדה שויכה לעובד בהצלחה!';
        await renderTable();
    } catch(err) {
        msg.style.color = 'hsl(var(--color-danger))';
        msg.innerHTML = err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class='bx bx-book-add'></i> הקצה לומדה`;
        setTimeout(() => msg.innerHTML='', 3000);
    }
  });

}
