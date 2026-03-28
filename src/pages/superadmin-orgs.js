import { fetchOrganizations, createOrganization, updateOrganization, deleteOrganization } from '../api/orgApi.js'
import { resetOrgProgress } from '../api/progressApi.js'
import { showConfirmModal, showToast, applyOrganizationStyles } from '../lib/ui.js'

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
                <label class="form-label" for="org-logo">קישור ללוגו (URL)</label>
                <input class="form-control" type="url" id="org-logo" placeholder="https://domain.com/logo.png">
             </div>
             <div class="form-group" style="text-align: right;">
                <label class="form-label" for="org-color">צבע ראשי (White License)</label>
                <div style="display: flex; gap: 12px; align-items: center; flex-direction: row-reverse;">
                  <div style="position: relative; width: 48px; height: 48px; overflow: hidden; border-radius: 10px; border: 1px solid hsl(var(--border-color)); box-shadow: var(--shadow-sm); flex-shrink: 0;">
                    <input type="color" id="org-color" value="#0066FF" style="position: absolute; top: -10px; left: -10px; width: 80px; height: 80px; cursor: pointer; border: none; padding: 0;">
                  </div>
                  <div style="flex: 1; position: relative; direction: ltr;">
                    <span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: hsl(var(--text-muted)); font-weight: 700; font-size: 0.75rem; letter-spacing: 0.05em; font-family: var(--font-en); pointer-events: none;">HEX</span>
                    <input class="form-control" type="text" id="org-color-hex" value="#0066FF" placeholder="#0066FF" maxlength="7" style="padding-left: 48px; font-family: var(--font-en); font-weight: 600; text-transform: uppercase; background: hsl(var(--bg-surface-hover)/0.3); border-color: hsl(var(--border-color)); height: 48px;">
                  </div>
                </div>
                <div class="color-presets mt-4" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; margin-top: 1.25rem;">
                  ${['#0066FF', '#198754', '#DC3545', '#FFC107', '#6610F2', '#FD7E14', '#20C997', '#0DCAF0', '#343A40', '#6C757D'].map(c => `
                    <div class="color-preset-item" data-color="${c}" style="width: 26px; height: 26px; background: ${c}; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.1);" title="${c}" onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='white'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='transparent'; this.style.boxShadow='0 1px 2px rgba(0,0,0,0.1)';"></div>
                  `).join('')}
                </div>
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
                  <th style="width: 60px;"></th>
                  <th style="min-width: 180px;">שם הארגון</th>
                  <th>משתמשים</th>
                  <th>לומדות</th>
                  <th>תאריך הקמה</th>
                  <th style="text-align: left;">פעולות</th>
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
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען...</td></tr>`
      const orgs = await fetchOrganizations()
      console.log(`[LMS] Table Render: Fetched ${orgs.length} organizations.`);
      if (orgs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;" class="text-muted">אין ארגונים במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = orgs.map(o => `
        <tr data-id="${o.id}">
           <td style="width: 60px;">
              ${o.logo_url ? `<img src="${o.logo_url}" alt="${o.name}" style="width: 40px; height: 40px; object-fit: contain; border-radius: 4px;">` : `<div style="width: 40px; height: 40px; background: hsl(var(--bg-surface-hover)); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: hsl(var(--text-muted)); font-size: 1.25rem;"><i class='bx bx-image'></i></div>`}
           </td>
           <td style="white-space: nowrap;">
              <div style="font-weight: 600; color: hsl(var(--text-main));">${o.name}</div>
              <div class="text-xs text-muted font-mono" style="user-select: all; cursor: pointer; opacity: 0.7;" title="לחץ להעתקה" onclick="navigator.clipboard.writeText('${o.id}'); showToast('המזהה הועתק')">${o.id}</div>
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
               <button class="btn btn-outline text-sm edit-org-btn" data-logo="${o.logo_url || ''}" 
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
        message: `האם אתה בטוח שברצונך למחוק את <strong>כל נתוני הלמידה</strong> של ארגון <strong>${orgName}</strong>? פעולה זו אינה הפיכה.`,
        onConfirm: async () => {
            await resetOrgProgress(orgId);
            showToast(`כל נתוני הלמידה של ${orgName} אופסו`);
        }
      });
    }

    if (editBtn) {
      document.getElementById('edit-org-id').value = editBtn.dataset.id;
      document.getElementById('org-name').value = editBtn.dataset.name;
      document.getElementById('org-logo').value = editBtn.dataset.logo || '';
      const colorValue = editBtn.dataset.color || '#0066FF';
      document.getElementById('org-color').value = colorValue;
      document.getElementById('org-color-hex').value = colorValue.toUpperCase();
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
      applyOrganizationStyles(user);
      window.location.hash = '#/admin';
    }
  });

  // Color Picker Sync Logic
  const colorPicker = container.querySelector('#org-color');
  const colorHex = container.querySelector('#org-color-hex');
  const presetItems = container.querySelectorAll('.color-preset-item');

  colorPicker.addEventListener('input', (e) => {
    colorHex.value = e.target.value.toUpperCase();
  });

  colorHex.addEventListener('input', (e) => {
    let val = e.target.value;
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      colorPicker.value = val;
    }
  });

  presetItems.forEach(item => {
    item.addEventListener('click', () => {
      const color = item.dataset.color;
      colorPicker.value = color;
      colorHex.value = color.toUpperCase();
      // Simple feedback
      item.style.transform = 'scale(0.9)';
      setTimeout(() => item.style.transform = 'scale(1)', 100);
    });
  });

  await renderTable()

  container.querySelector('#org-cancel-edit').addEventListener('click', () => {
    form.reset();
    document.getElementById('edit-org-id').value = '';
    document.getElementById('org-submit-btn').innerHTML = `<i class='bx bx-plus-circle'></i> פתח סביבת הדרכה`;
    document.getElementById('org-color-hex').value = '#0066FF';
    document.getElementById('org-color').value = '#0066FF';
    container.querySelector('.card h3').innerText = 'יצירת ארגון חדש';
    document.getElementById('org-cancel-edit').style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const submitBtn = document.getElementById('org-submit-btn')
    const orgId = document.getElementById('edit-org-id').value;
    const orgName = document.getElementById('org-name').value;
    const orgLogo = document.getElementById('org-logo').value;
    const orgColor = document.getElementById('org-color').value;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שומר...`;
    
    try {
      if (orgId) {
        await updateOrganization(orgId, orgName, orgColor, orgLogo);
        showToast('הארגון עודכן');
      } else {
        await createOrganization(orgName, orgColor, orgLogo);
        showToast('הארגון נוצר בהצלחה');
      }
      await renderTable();
      form.reset();
      document.getElementById('edit-org-id').value = '';
      submitBtn.innerHTML = `<i class='bx bx-plus-circle'></i> פתח סביבת הדרכה`;
      document.getElementById('org-color-hex').value = '#0066FF';
      document.getElementById('org-color').value = '#0066FF';
      container.querySelector('.card h3').innerText = 'יצירת ארגון חדש';
      document.getElementById('org-cancel-edit').style.display = 'none';
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  })
}
