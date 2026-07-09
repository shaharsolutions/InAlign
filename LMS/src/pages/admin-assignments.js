import { fetchCourseAssignments, assignCourseToOrg, unassignCourse } from '../api/assignmentApi.js'
import { fetchOrganizations } from '../api/orgApi.js'
import { fetchCourses, getContentTypeMeta } from '../api/coursesApi.js'
import { escapeAttr, escapeHtml } from '../lib/html.js'

export default async function renderAdminAssignments(container) {
  
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">הקצאת תוכן למידה לארגונים</h1>
      <p class="text-muted">שיוך לומדות, סרטונים, מצגות וקבצי PDF מקטלוג המערכת לארגונים השונים</p>
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
               <label class="form-label" for="select-course">בחר תוכן להקצאה <span style="color: hsl(var(--color-danger));">*</span></label>
               <select class="form-control" id="select-course" required>
                  <option value="">טוען תוכן למידה...</option>
               </select>
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-book-add'></i> הקצה תוכן לארגון
            </button>
            <div id="assignment-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;" class="mb-3">
           <h3 style="margin: 0;">תוכן שהוקצה לארגונים</h3>
           <span id="assignments-count" class="text-sm text-muted">טוען הקצאות...</span>
         </div>
         <div class="mb-4" style="display: grid; grid-template-columns: minmax(180px, 1.2fr) minmax(150px, 1fr) minmax(150px, 1fr) auto; gap: 0.75rem; align-items: end;">
            <div class="form-group" style="margin: 0;">
               <label class="form-label" for="assignment-search">חיפוש</label>
               <input class="form-control" id="assignment-search" type="search" placeholder="שם תוכן או ארגון...">
            </div>
            <div class="form-group" style="margin: 0;">
               <label class="form-label" for="assignment-org-filter">ארגון</label>
               <select class="form-control" id="assignment-org-filter">
                  <option value="">כל הארגונים</option>
               </select>
            </div>
            <div class="form-group" style="margin: 0;">
               <label class="form-label" for="assignment-type-filter">סוג תוכן</label>
               <select class="form-control" id="assignment-type-filter">
                  <option value="">כל סוגי התוכן</option>
                  <option value="scorm">לומדה</option>
                  <option value="video">סרטון</option>
                  <option value="pdf">PDF</option>
                  <option value="presentation">מצגת</option>
               </select>
            </div>
            <button class="btn btn-outline text-sm" type="button" id="assignment-reset-filters" title="איפוס סינון" style="height: 48px;">
              <i class='bx bx-reset'></i>
            </button>
         </div>
         <table class="table" id="assignments-table">
            <thead>
               <tr>
                  <th>שם הארגון</th>
                  <th>תוכן</th>
                  <th>סוג תוכן</th>
                  <th>תאריך הקצאה</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="5" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען הקצאות...</td></tr>
            </tbody>
         </table>
       </div>
    </div>
  `

  const selectTarget = container.querySelector('#select-target');
  const selectCourse = container.querySelector('#select-course');
  const tbody = container.querySelector('#assignments-table tbody');
  const countLabel = container.querySelector('#assignments-count');
  const searchInput = container.querySelector('#assignment-search');
  const orgFilter = container.querySelector('#assignment-org-filter');
  const typeFilter = container.querySelector('#assignment-type-filter');
  const resetFiltersBtn = container.querySelector('#assignment-reset-filters');
  let assignmentRecords = [];

  function getFilteredAssignments() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const selectedOrg = orgFilter.value;
    const selectedType = typeFilter.value;

    return assignmentRecords.filter(record => {
      const orgName = record.target_name || '';
      const courseTitle = record.course_title || '';
      const contentType = record.content_type || 'scorm';
      const matchesSearch = !searchTerm || [orgName, courseTitle, getContentTypeMeta(contentType).label]
        .some(value => value.toLowerCase().includes(searchTerm));
      const matchesOrg = !selectedOrg || record.org_id === selectedOrg;
      const matchesType = !selectedType || contentType === selectedType;
      return matchesSearch && matchesOrg && matchesType;
    });
  }

  function renderAssignmentRows() {
    const records = getFilteredAssignments();
    countLabel.textContent = `מציג ${records.length} מתוך ${assignmentRecords.length} הקצאות`;

    if (assignmentRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center">אין הקצאות להצגה</td></tr>`;
      return;
    }

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center">לא נמצאו הקצאות שתואמות לסינון</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const contentType = r.content_type || 'scorm';
      const contentMeta = getContentTypeMeta(contentType);
      return `
        <tr>
          <td><div style="font-weight: 500;">${escapeHtml(r.target_name || 'נמחק')}</div></td>
          <td>${escapeHtml(r.course_title || 'נמחק')}</td>
          <td><span class="badge badge-primary">${escapeHtml(contentMeta.label)}</span></td>
          <td>${escapeHtml(r.assigned_at || '-')}</td>
          <td>
             <button class="btn btn-outline text-sm delete-btn" data-id="${escapeAttr(r.id)}" title="בטל הקצאה"><i class='bx bx-unlink' style="color: hsl(var(--color-danger));"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    bindDeleteButtons();
  }

  function bindDeleteButtons() {
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
                  msg.innerHTML = 'שגיאה בהסרת הקצאה: ' + escapeHtml(err.message);
                  setTimeout(() => msg.innerHTML='', 4000);
                  await renderTable();
              }
          } else {
              btn.classList.add('confirming');
              btn.innerHTML = `לחץ שוב לאישור מחיקה`;
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
  }

  // Fetch combo boxes data
  async function loadComboBoxes() {
    try {
        const [targets, courses] = await Promise.all([
            fetchOrganizations(),
            fetchCourses()
        ]);
        
        selectTarget.innerHTML = targets.length === 0 
           ? '<option value="">לא נמצאו ארגונים</option>'
           : `<option value="">-- בחר ארגון יעד --</option>` + targets.map(l => `<option value="${escapeAttr(l.id)}">${escapeHtml(l.name)}</option>`).join('');

        orgFilter.innerHTML = targets.length === 0
           ? '<option value="">כל הארגונים</option>'
           : `<option value="">כל הארגונים</option>` + targets.map(l => `<option value="${escapeAttr(l.id)}">${escapeHtml(l.name)}</option>`).join('');
           
        selectCourse.innerHTML = courses.length === 0 
           ? '<option value="">אין תוכן זמין</option>'
           : `<option value="">-- בחר תוכן למידה --</option>` + courses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)} (${escapeHtml(getContentTypeMeta(c.content_type).label)})</option>`).join('');

    } catch(err) {
        selectTarget.innerHTML = `<option value="">שגיאה בטעינה</option>`;
        selectCourse.innerHTML = `<option value="">שגיאה בטעינה</option>`;
    }
  }

  // Load Main Table
  async function renderTable() {
    try {
      assignmentRecords = await fetchCourseAssignments();
      renderAssignmentRows();
    } catch(err) {
      countLabel.textContent = 'שגיאה בטעינת הקצאות';
      tbody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center;">שגיאה: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  await loadComboBoxes();
  await renderTable();

  searchInput.addEventListener('input', renderAssignmentRows);
  orgFilter.addEventListener('change', renderAssignmentRows);
  typeFilter.addEventListener('change', renderAssignmentRows);
  resetFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    orgFilter.value = '';
    typeFilter.value = '';
    renderAssignmentRows();
  });

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
        msg.innerHTML = 'התוכן שויך לארגון בהצלחה!';
        await renderTable();
    } catch(err) {
        msg.style.color = 'hsl(var(--color-danger))';
        msg.innerHTML = err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class='bx bx-book-add'></i> הקצה תוכן לארגון`;
        setTimeout(() => msg.innerHTML='', 3000);
    }
  });

}
