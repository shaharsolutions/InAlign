import { fetchOrgProgress, adminUpdateLearnerProgress, resetUserProgress } from '../api/progressApi.js'
import { exportToCSV, exportToPDF } from '../lib/exportUtils.js'
import { fetchOrganizations, fetchOrganizationById } from '../api/orgApi.js'
import { getCurrentUserSync } from '../api/authApi.js'
import { showToast, showEditProgressModal } from '../lib/ui.js'

export default async function renderAdminDashboard(container) {
  const user = getCurrentUserSync();
  const isSuperAdmin = user?.role === 'super_admin';
  let organizations = [];
  
  if (isSuperAdmin) {
    try {
      organizations = await fetchOrganizations();
    } catch (e) { console.error("Failed to fetch organizations", e); }
  }

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4 fade-in">
      <div>
        <h1 class="mb-1">דשבורד ודו"חות למידה</h1>
        <p class="text-muted">מעקב מלא אחרי ביצועי עובדים וייצוא נתונים למנהלים</p>
      </div>
      <div class="flex gap-2 items-center">
        <button class="btn btn-outline" onclick="window.location.hash = '#/admin/users'">
          <i class='bx bx-user-plus'></i> ניהול עובדים
        </button>
        <button class="btn btn-outline" onclick="window.location.hash = '#/admin/groups'">
          <i class='bx bx-group'></i> ניהול קבוצות
        </button>
        <button class="btn btn-primary" onclick="window.location.hash = '#/admin/scorm'">
          <i class='bx bx-upload'></i> ניהול והעלאת SCORM
        </button>
      </div>
    </div>
    
    <div id="welcome-message-container"></div>
    
    ${isSuperAdmin ? `
    <div class="card mb-4 slide-up" style="border-right: 4px solid hsl(var(--color-primary));">
        <div class="flex items-center gap-4">
            <div style="font-weight: 600;">סינון לפי ארגון:</div>
            <select id="org-filter" class="form-control" style="max-width: 300px; margin: 0;">
                <option value="">-- כל הארגונים --</option>
                ${organizations.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
            </select>
            <div class="text-sm text-muted">כמנהל על, באפשרותך לצפות בנתוני הלמידה מכלל הסביבות במערכת.</div>
        </div>
    </div>
    ` : ''}

    <div class="stats grid grid-cols-4 mb-4 slide-up" style="gap: 2rem;">
      <div class="card">
         <h4 class="mb-1 text-muted">לומדים פעילים</h4>
         <div id="stat-active-users" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
         <h4 class="mb-1 text-muted">השלמות</h4>
         <div id="stat-completed" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
         <h4 class="mb-1 text-muted">זמן ממוצע</h4>
         <div id="stat-avg-time" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
         <h4 class="mb-1 text-muted">סך הכל רשומות</h4>
         <div id="stat-total" style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
    </div>
    
    <div class="card slide-up mb-4 table-wrapper">
      <div class="flex justify-between items-center mb-4">
         <h3 class="mb-0">מעקב ולומדות</h3>
         <div class="flex gap-2 items-center">
           <button class="btn btn-outline text-sm" id="btn-export-excel" title="ייצוא ל-Excel"><i class='bx bx-spreadsheet' style="color: #107c41;"></i> הורידו Excel</button>
           <button class="btn btn-outline text-sm" id="btn-export-csv" title="ייצוא ל-CSV"><i class='bx bx-file'></i> CSV</button>
           <button class="btn btn-outline text-sm" id="btn-export-pdf" title="ייצוא ל-PDF"><i class='bx bxs-file-pdf' style="color: #F40F02;"></i> PDF</button>
         </div>
      </div>
      
      <table class="table" id="progress-table">
        <thead>
          <tr>
            <th>שם הלומד</th>
            <th>שם הלומדה</th>
            <th>סטטוס</th>
            <th>התקדמות</th>
            <th>ציון</th>
            <th>זמן למידה</th>
            <th>תאריך סיום</th>
            <th>פעולה</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="8" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען נתונים...</td></tr>
        </tbody>
      </table>
    </div>
  `

  const tbody = container.querySelector('#progress-table tbody');
  let currentRecords = [];

  async function loadData(orgId = null) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען נתונים...</td></tr>`;
    try {
      currentRecords = await fetchOrgProgress(orgId);
      
      if(currentRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;" class="text-muted">לא נמצאו נתוני למידה תואמים.</td></tr>`;
        updateStats(0, 0, 0, 0);
        return;
      }
      
      tbody.innerHTML = currentRecords.map((r, idx) => `
        <tr>
          <td>${r.user_name || 'משתמש לא ידוע'}</td>
          <td style="font-weight: 500;">${r.course_title || 'קורס שנמחק'}</td>
          <td>
            <span class="badge ${r.status === 'הושלם' ? 'badge-success' : r.status === 'בתהליך' ? 'badge-primary' : 'badge-warning'}">
              ${r.status}
            </span>
          </td>
          <td>
            <div class="flex items-center gap-2">
              <div class="progress-bar-bg" style="width: 60px; margin: 0; height: 8px;">
                <div class="progress-bar-fill" style="width: ${r.progress}%; ${r.status === 'הושלם' ? 'background: hsl(var(--color-success));' : ''}"></div>
              </div>
              <span class="text-sm text-muted">${r.progress}%</span>
            </div>
          </td>
          <td>${r.score}</td>
          <td>${r.time}</td>
          <td>${r.date}</td>
          <td>
            <button class="btn btn-outline text-sm edit-reg-btn" data-index="${idx}" title="עריכת רישום"><i class='bx bx-edit-alt'></i></button>
          </td>
        </tr>
      `).join('');

      // Calculate simple stats
      const total = currentRecords.length;
      const completed = currentRecords.filter(r => r.status === 'הושלם').length;
      const active = new Set(currentRecords.map(r => r.user_name)).size;
      updateStats(active, completed, '--', total);

      // Add listener for the edit enrollment button
      container.querySelectorAll('.edit-reg-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const idx = e.currentTarget.dataset.index;
          const record = currentRecords[idx];
          
          await showEditProgressModal({
            record,
            onSave: async (updates) => {
                await adminUpdateLearnerProgress(record.user_id, record.course_id, updates);
                showToast('הרישום עודכן בהצלחה');
                loadData(filter?.value || null);
            },
            onDelete: async () => {
                await resetUserProgress(record.user_id, record.course_id);
                showToast('הרישום נמחק בהצלחה');
                loadData(filter?.value || null);
            }
          });
        });
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: hsl(var(--color-danger));">שגיאה: ${err.message}</td></tr>`;
    }
  }

  function updateStats(active, comp, time, total) {
    document.getElementById('stat-active-users').innerText = active;
    document.getElementById('stat-completed').innerText = comp;
    document.getElementById('stat-avg-time').innerText = time;
    document.getElementById('stat-total').innerText = total;
  }

  // Initial load
  await loadData();

  // Load Welcome Message
  if (user.orgId) {
    try {
      const org = await fetchOrganizationById(user.orgId);
      if (org?.welcome_message) {
        const welcomeContainer = container.querySelector('#welcome-message-container');
        if (welcomeContainer) {
          welcomeContainer.innerHTML = `
            <div class="card mb-6 slide-up" style="background: linear-gradient(135deg, hsl(var(--color-primary)/0.08) 0%, transparent 100%); border-right: 5px solid hsl(var(--color-primary)); padding: 1.25rem 2rem;">
               <div class="flex gap-4 items-center">
                  <div style="font-size: 1.5rem; color: hsl(var(--color-primary)); flex-shrink: 0;"><i class='bx bxs-megaphone'></i></div>
                  <p style="margin:0; font-weight: 500; font-size: 1.1rem; line-height: 1.4; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;">${org.welcome_message}</p>
               </div>
            </div>
          `;
        }
      }
    } catch (e) {
      console.error("Failed to load welcome message", e);
    }
  }

  // Filter change listener
  const filter = container.querySelector('#org-filter');
  if (filter) {
    filter.addEventListener('change', (e) => {
        loadData(e.target.value);
    });
  }
  
  // Attach Export Logic
  const exportHandler = async (type) => {
    showToast('מייצר קובץ...', 'success');
    try {
      let blob, filename;
      if (type === 'pdf') {
        filename = 'InAlign_Learners_Report.pdf';
        blob = await exportToPDF('progress-table'); 
      } else {
        filename = 'InAlign_Learners_Report.csv';
        const formattedRecords = currentRecords.map(r => ({
          'שם הלומד': r.user_name || 'משתמש לא ידוע',
          'שם הלומדה': r.course_title || 'קורס שנמחק',
          'סטטוס': r.status,
          'התקדמות (%)': r.progress,
          'ציון': r.score || '-',
          'זמן למידה': r.time,
          'תאריך מועד': r.date
        }));
        blob = exportToCSV(formattedRecords);
      }

      if(!blob) throw new Error("אין נתונים לייצוא");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      showToast('הקובץ מוכן!', 'success');
      
      setTimeout(() => { if(document.body.contains(a)) document.body.removeChild(a); }, 100);
    } catch(err) {
      showToast('שגיאה ביצוא: ' + err.message, 'error');
    }
  };

  container.querySelector('#btn-export-excel').addEventListener('click', () => exportHandler('csv'));
  container.querySelector('#btn-export-csv').addEventListener('click', () => exportHandler('csv'));
  container.querySelector('#btn-export-pdf').addEventListener('click', () => exportHandler('pdf'));
}
