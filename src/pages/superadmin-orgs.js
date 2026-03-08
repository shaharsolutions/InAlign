import { fetchOrganizations, createOrganization } from '../api/orgApi.js'

export default async function renderSuperAdminOrgs(container) {
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">ניהול ארגונים (Super Admin)</h1>
      <p class="text-muted">יצירה, עדכון ושליטה על כלל הדיירים במערכת המולטי-טננט הארגונית.</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 1.5rem; align-items: start;">
       <!-- Add Org Form Section -->
       <div class="card" style="grid-column: span 1;">
         <h3 class="mb-3">יצירת ארגון חדש</h3>
         <form id="org-create-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="org-name">שם הארגון <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="org-name" required placeholder="לדוגמה: אלביט מערכות">
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="org-color">צבע ראשי (White License)</label>
               <input class="form-control" type="color" id="org-color" value="#0066FF" style="height: 45px;">
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-plus-circle'></i> פתח סביבת הדרכה
            </button>
            <div id="org-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Orgs Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <h3 class="mb-3">רשימת הארגונים ב-LMS</h3>
         <table class="table" id="orgs-table">
            <thead>
               <tr>
                  <th>שם הארגון</th>
                  <th>משתמשים</th>
                  <th>לומדות (SCORM)</th>
                  <th>תאריך הקמה</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="5" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען ארגונים מהשרת...</td></tr>
            </tbody>
         </table>
       </div>
    </div>
  `

  const tableBody = container.querySelector('#orgs-table tbody')

  async function renderTable() {
    try {
      const orgs = await fetchOrganizations()
      if (orgs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">אין ארגונים במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = orgs.map(o => `
        <tr>
           <td><div style="font-weight: 500;">${o.name}</div></td>
           <td><span class="badge badge-success">${o.total_users || 0} פעילים</span></td>
           <td><span class="badge badge-primary">${o.total_courses || 0} חבילות</span></td>
           <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('he-IL') : '-'}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm" title="עריכת White Label"><i class='bx bx-edit'></i></button>
               <button class="btn btn-outline text-sm" title="נהל משתמשים"><i class='bx bx-group'></i></button>
             </div>
           </td>
        </tr>
      `).join('')
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה בטעינת הארגונים: ${err.message}</td></tr>`
    }
  }

  // Initial render
  await renderTable()

  // Handle org creation
  const form = container.querySelector('#org-create-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const msg = document.getElementById('org-msg')
    const submitBtn = form.querySelector('button[type="submit"]')
    
    // Values
    const orgName = document.getElementById('org-name').value
    const orgColor = document.getElementById('org-color').value

    submitBtn.disabled = true
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> פותח סביבת Tenant...`
    
    try {
      await createOrganization(orgName, orgColor);
      await renderTable();
      form.reset();
      msg.style.color = 'hsl(var(--color-success))';
      msg.innerHTML = 'הארגון נוצר בהצלחה!';
    } catch (err) {
      msg.style.color = 'hsl(var(--color-danger))';
      msg.innerHTML = 'שגיאה: ' + err.message;
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = `<i class='bx bx-plus-circle'></i> פתח סביבת הדרכה`
      setTimeout(() => { msg.innerHTML = '' }, 3000)
    }
  })
}
