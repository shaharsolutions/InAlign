import { fetchOrgProgress } from '../api/progressApi.js'
import { exportToCSV, exportToPDF } from '../lib/exportUtils.js'

export default async function renderAdminDashboard(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-4 fade-in">
      <div>
        <h1 class="mb-1">דשבורד ודו"חות למידה</h1>
        <p class="text-muted">מעקב מלא אחרי ביצועי עובדים בארגון שלך וייצוא נתונים ארגוניים</p>
      </div>
      <div class="flex gap-2 items-center">
        <button class="btn btn-outline" onclick="window.location.hash = '#/admin/users'">
          <i class='bx bx-user-plus'></i> ניהול עובדים
        </button>
        <button class="btn btn-outline" onclick="window.location.hash = '#/admin/assignments'">
          <i class='bx bx-group'></i> הקצאת עובדים
        </button>
        <button class="btn btn-primary" onclick="window.location.hash = '#/admin/scorm'">
          <i class='bx bx-upload'></i> ניהול והעלאת SCORM
        </button>
      </div>
    </div>
    
    <!-- We skip full stats calculation for MVP demo, showing placeholders -->
    <div class="stats grid grid-cols-4 mb-4 slide-up" style="gap: 1.5rem;">
      <div class="card">
         <h4 class="mb-1 text-muted">לומדים פעילים בארגון</h4>
         <div style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
         <h4 class="mb-1 text-muted">השלמות החודש</h4>
         <div style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
         <h4 class="mb-1 text-muted">זמן למידה ממוצע</h4>
         <div style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
      <div class="card">
         <h4 class="mb-1 text-muted">לומדות מפורסמות</h4>
         <div style="font-size: 1.8rem; font-weight: 700;">--</div>
      </div>
    </div>
    
    <div class="card slide-up mb-4 table-wrapper">
      <div class="flex justify-between items-center mb-4">
         <h3 class="mb-0">מעקב ולומדות</h3>
         <div class="flex gap-2 items-center">
           <span id="admin-export-msg" class="text-sm font-medium" style="color: hsl(var(--color-primary)); margin-left: 1rem;"></span>
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
          <tr><td colspan="8" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען נתוני התקדמות עבור הארגון שלך...</td></tr>
        </tbody>
      </table>
    </div>
  `

  const tbody = container.querySelector('#progress-table tbody');
  
  try {
    const records = await fetchOrgProgress();
    
    if(records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;" class="text-muted">לא קיימים נתונים עבור ארגון זה המעידים על למידה.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = records.map(r => `
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
          <button class="btn btn-outline text-sm" title="ערוך רישום (הדגמה)" onclick="
            const msg = document.getElementById('admin-export-msg');
            msg.innerHTML = 'עריכת רישום (הדגמה) תהיה זמינה בגרסה הבאה';
            msg.style.color = 'hsl(var(--color-warning))';
            setTimeout(() => { msg.innerHTML = ''; msg.style.color = 'hsl(var(--color-primary))'; }, 3000);
          "><i class='bx bx-edit-alt'></i></button>
        </td>
      </tr>
    `).join('');
    
    // Attach Export Logic
    const exportHandler = async (type) => {
      const msg = document.getElementById('admin-export-msg');
      msg.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> מייצר קובץ...';
      try {
        let blob, filename;
        if (type === 'pdf') {
          filename = 'LMS_Learners_Report.pdf';
          blob = await exportToPDF('progress-table'); 
        } else {
          filename = 'LMS_Learners_Report.csv';
          const formattedRecords = records.map(r => ({
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
        
        // יצירת קישור מאובטח (Blob URL) שמקובל על כל הדפדפנים
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        // ניסיון הורדה אוטומטית
        a.click();
        
        // חשיפת קישור הורדה מפורש לגיבוי למקרה שספארי ירט אותו כ-UUID בגלל אסינכרוניות
        msg.style.color = 'hsl(var(--color-success))';
        msg.innerHTML = `הקובץ מוכן. <a href="${url}" download="${filename}" style="text-decoration: underline; margin-right: 5px;" class="font-bold">לחץ כאן לשמירה סופית</a>`;
        
        // ניקוי זבל שקט
        setTimeout(() => {
          if(document.body.contains(a)) document.body.removeChild(a);
        }, 100);

      } catch(err) {
        msg.style.color = 'hsl(var(--color-danger))';
        msg.innerHTML = 'שגיאה: ' + err.message;
        setTimeout(() => { msg.innerHTML = ''; msg.style.color='hsl(var(--color-primary))'; }, 3000);
      }
    };

    container.querySelector('#btn-export-excel').addEventListener('click', () => exportHandler('csv'));
    container.querySelector('#btn-export-csv').addEventListener('click', () => exportHandler('csv'));
    container.querySelector('#btn-export-pdf').addEventListener('click', () => exportHandler('pdf'));

  } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: hsl(var(--color-danger));">שגיאה בטעינת נתוני הארגון: ${err.message}</td></tr>`;
  }
}
