import { fetchOrganizations, createOrganization, updateOrganization, deleteOrganization } from '../api/orgApi.js'
import { resetOrgProgress } from '../api/progressApi.js'
import { showConfirmModal, showToast } from '../lib/ui.js'

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
            
            <input type="hidden" id="edit-org-id" value="">
            <button id="org-submit-btn" type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-plus-circle'></i> פתח סביבת הדרכה
            </button>
            <button type="button" id="org-cancel-edit" class="btn btn-outline w-full justify-center mt-2" style="display: none;">
              בטל עריכה
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
                  <th>לומדות</th>
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
  const form = container.querySelector('#org-create-form')

  async function renderTable() {
    try {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען...</td></tr>`
      const orgs = await fetchOrganizations()
      console.log(`[LMS] Table Render: Fetched ${orgs.length} organizations.`);
      if (orgs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">אין ארגונים במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = orgs.map(o => `
        <tr data-id="${o.id}">
           <td>
              <div style="font-weight: 500;">${o.name}</div>
              <div class="text-xs text-muted font-mono" style="user-select: all; cursor: pointer;" title="לחץ להעתקה" onclick="navigator.clipboard.writeText('${o.id}'); showToast('המזהה הועתק')">${o.id}</div>
           </td>

           <td>
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: hsl(var(--color-success)/0.1); color: hsl(var(--color-success)); border-radius: 500px; width: 65px; height: 65px; font-weight: bold; line-height: 1.1; margin: 0 auto;">
                <span style="font-size: 1.2rem;">${o.total_users || 0}</span>
                <span style="font-size: 0.7rem; opacity: 0.9;">פעילים</span>
              </div>
           </td>
           <td><span class="badge badge-primary">${o.total_courses || 0} חבילות</span></td>
           <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('he-IL') : '-'}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm edit-org-btn" 
                 data-id="${o.id}" data-name="${o.name}" data-color="${o.primary_color || '#0066FF'}" 
                 title="עריכה">
                 <i class='bx bx-edit'></i>
               </button>
                <button class="btn btn-outline text-sm reset-org-btn" data-id="${o.id}" data-name="${o.name}" title="איפוס נתונים">
                  <i class='bx bx-refresh' style="color: hsl(var(--color-danger));"></i>
                </button>
               <button class="btn btn-primary text-sm enter-org-btn" data-id="${o.id}" data-name="${o.name}" title="למערכת">
                 <i class='bx bx-door-open'></i> למערכת
               </button>
               <button class="btn btn-outline text-sm delete-org-btn" data-id="${o.id}" data-name="${o.name}" title="מחיקת ארגון">
                 <i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i>
               </button>
             </div>
           </td>
        </tr>
      `).join('')
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה: ${err.message}</td></tr>`
    }
  }

  tableBody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-org-btn');
    const enterBtn = e.target.closest('.enter-org-btn');
    const resetBtn = e.target.closest('.reset-org-btn');
    const deleteBtn = e.target.closest('.delete-org-btn');

    if (deleteBtn) {
      const orgId = deleteBtn.dataset.id;
      const orgName = deleteBtn.dataset.name;
      
      await showConfirmModal({
        title: 'מחיקת ארגון לצמיתות',
        message: `אתה עומד למחוק את ארגון <strong>${orgName}</strong>. פעולה זו תמחק את כל המידע הקשור לארגון ולא ניתנת לביטול! האם להמשיך?`,
        confirmText: 'מחק ארגון לצמיתות',
        onConfirm: async () => {
            try {
                await deleteOrganization(orgId);
                showToast(`הארגון ${orgName} נמחק מהמערכת`);
                renderTable();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
      });
    }

    if (resetBtn) {
      const orgId = resetBtn.dataset.id;
      const orgName = resetBtn.dataset.name;
      
      await showConfirmModal({
        title: 'אזהרת איפוס ארגון',
        message: `האם אתה בטוח שברצונך למחוק את <strong>כל נתוני اللמידה</strong> של ארגון <strong>${orgName}</strong>? פעולה זו אינה הפיכה.`,
        onConfirm: async () => {
            await resetOrgProgress(orgId);
            showToast(`כל נתוני הלמידה של ${orgName} אופסו`);
        }
      });
    }

    if (editBtn) {
      document.getElementById('edit-org-id').value = editBtn.dataset.id;
      document.getElementById('org-name').value = editBtn.dataset.name;
      document.getElementById('org-color').value = editBtn.dataset.color || '#0066FF';
      document.getElementById('org-submit-btn').innerHTML = `<i class='bx bx-save'></i> שמור שינויים`;
      container.querySelector('.card h3').innerText = 'עריכת ארגון קיים';
      document.getElementById('org-cancel-edit').style.display = 'flex';
    }

    if (enterBtn) {
      const user = window.__APP_STATE?.user;
      if (!user) return;
      user.originalRole = user.role;
      user.originalOrgId = user.orgId;
      user.role = 'org_admin';
      user.orgId = enterBtn.dataset.id;
      user.orgName = enterBtn.dataset.name;
      window.location.hash = '#/admin';
    }
  });

  await renderTable()

  container.querySelector('#org-cancel-edit').addEventListener('click', () => {
    form.reset();
    document.getElementById('edit-org-id').value = '';
    document.getElementById('org-submit-btn').innerHTML = `<i class='bx bx-plus-circle'></i> פתח סביבת הדרכה`;
    container.querySelector('.card h3').innerText = 'יצירת ארגון חדש';
    document.getElementById('org-cancel-edit').style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const submitBtn = document.getElementById('org-submit-btn')
    const orgId = document.getElementById('edit-org-id').value;
    const orgName = document.getElementById('org-name').value;
    const orgColor = document.getElementById('org-color').value;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שומר...`;
    
    try {
      if (orgId) {
        await updateOrganization(orgId, orgName, orgColor);
        showToast('הארגון עודכן');
      } else {
        await createOrganization(orgName, orgColor);
        showToast('הארגון נוצר בהצלחה');
      }
      await renderTable();
      form.reset();
      document.getElementById('edit-org-id').value = '';
      submitBtn.innerHTML = `<i class='bx bx-plus-circle'></i> פתח סביבת הדרכה`;
      container.querySelector('.card h3').innerText = 'יצירת ארגון חדש';
      document.getElementById('org-cancel-edit').style.display = 'none';
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  })
}
