import { fetchUsers, createUser, bulkCreateUsers, deleteUser, updateUser, bulkUpdateUsersOrg, bulkDeleteUsers, bulkUpdateUsersRole } from '../api/usersApi.js'
import { impersonateUser } from '../api/authApi.js'
import { resetUserProgress, resetOrgProgress, bulkAssignCourses } from '../api/progressApi.js'
import { fetchGroups, assignUsersToGroup, createGroup } from '../api/groupsApi.js'
import { getCurrentUserSync } from '../api/authApi.js'
import { showConfirmModal, showToast, showBulkGroupModal, showBulkOrgModal, showBulkRoleModal, showCustomModal } from '../lib/ui.js'
import { fetchOrganizations } from '../api/orgApi.js'
import { fetchCourses } from '../api/coursesApi.js'
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'

export default async function renderAdminUsers(container) {
  const currentUser = getCurrentUserSync();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  let organizations = [];
  let allUsers = []; // Store all fetched users for filtering

  if (isSuperAdmin) {
    try {
        organizations = await fetchOrganizations();
    } catch (e) {
        console.error("Failed to fetch organizations", e);
    }
  }

  // === Bulk Selection State & Logic ===
  let selectedUserIds = new Set();
  
  function updateBulkBar() {
    const bulkBar = container.querySelector('#bulk-actions-bar');
    const countSpan = container.querySelector('#selected-count');
    const selectAllCb = container.querySelector('#select-all-users');
    
    if (!bulkBar || !countSpan) return;

    // Scan all checkboxes manually for the most reliable state
    const allCheckboxes = Array.from(container.querySelectorAll('.user-checkbox'));
    const checked = allCheckboxes.filter(cb => cb.checked);
    const count = checked.length;

    // Update internal state set
    selectedUserIds.clear();
    checked.forEach(cb => {
      if (cb.dataset.id) selectedUserIds.add(cb.dataset.id);
    });

    if (count > 0) {
      bulkBar.classList.remove('hidden');
      bulkBar.style.display = 'block';
      countSpan.innerText = count === 1 ? 'משתמש 1 נבחר' : `${count} משתמשים נבחרו`;
    } else {
      bulkBar.classList.add('hidden');
      bulkBar.style.display = 'none';
      countSpan.innerText = '0 משתמשים נבחרו';
      if (selectAllCb) selectAllCb.checked = false;
    }
  }

  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">${isSuperAdmin ? 'ניהול משתמשים כלל מערכתי' : 'ניהול עובדי הארגון'}</h1>
      <p class="text-muted">הוספה, אימות ומחיקה של משתמשים המורשים להיכנס למערכת.</p>
    </div>

    <div id="bulk-actions-bar" class="card mb-4 slide-up hidden" style="background: hsl(var(--color-primary)/0.05); border: 1px dashed hsl(var(--color-primary)); padding: 1rem 1.5rem;">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <i class='bx bx-check-square' style="font-size: 1.5rem; color: hsl(var(--color-primary));"></i>
            <span class="font-bold" id="selected-count" style="font-size: 0.95rem;">0 משתמשים נבחרו</span>
          </div>
          <div style="width: 1px; height: 24px; background: hsla(var(--text-main), 0.1);"></div>
          <button class="btn btn-primary text-sm" id="bulk-group-btn">
            <i class='bx bx-group'></i> הוסף לקבוצה
          </button>
          ${isSuperAdmin ? `
          <button class="btn btn-outline text-sm" id="bulk-move-org-btn">
            <i class='bx bx-transfer'></i> העברה לארגון אחר
          </button>
          <button class="btn btn-outline text-sm" id="bulk-role-btn">
            <i class='bx bx-user-check'></i> שינוי תפקיד
          </button>
          ` : ''}
          <button class="btn btn-outline text-sm text-danger" id="bulk-delete-btn" style="color: hsl(var(--color-danger)); border-color: hsla(var(--color-danger), 0.3);">
            <i class='bx bx-trash'></i> מחיקה קבוצתית
          </button>
        </div>
        <button class="btn btn-outline text-sm" id="clear-selection-btn">ביטול בחירה</button>
      </div>
    </div>

    <div class="grid grid-cols-12 slide-up" style="gap: 2rem; align-items: start;">
       <!-- Add User Section (Top Full Width) -->
       <div class="card" style="grid-column: span 12; box-shadow: 0 10px 25px -10px hsla(var(--color-primary), 0.1); border: 1px solid hsla(var(--color-primary), 0.08);">
         <h3 class="mb-4" id="form-title" style="font-size: 1.1rem; border-bottom: 1px solid hsla(var(--text-main), 0.05); padding-bottom: 0.75rem;"><i class='bx bx-user-plus'></i> יצירת משתמש חדש</h3>
         <form id="user-create-form" class="flex flex-wrap items-end gap-3">
            <div class="form-group mb-0 flex-1" style="text-align: right; min-width: 200px;">
               <label class="form-label" for="user-name" style="font-size: 0.85rem; margin-bottom: 0.2rem;">שם מלא <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="user-name" required placeholder="לדוגמה: משה כהן" style="height: 44px; padding-top: 0; padding-bottom: 0;">
            </div>
            <div class="form-group mb-0 flex-1" style="text-align: right; min-width: 200px;">
               <label class="form-label" for="user-email" style="font-size: 0.85rem; margin-bottom: 0.2rem;">כתובת אימייל <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="email" id="user-email" required placeholder="moshe@company.com" style="height: 44px; padding-top: 0; padding-bottom: 0;">
            </div>
            <div class="form-group mb-0 flex-1" style="text-align: right; min-width: 150px;">
               <label class="form-label" for="user-phone" style="font-size: 0.85rem; margin-bottom: 0.2rem;">מספר טלפון</label>
               <input class="form-control" type="tel" id="user-phone" placeholder="050-0000000" style="height: 44px; padding-top: 0; padding-bottom: 0;">
            </div>
            <div class="form-group mb-0 flex-1" style="text-align: right; min-width: 150px;">
               <label class="form-label" for="user-password" style="font-size: 0.85rem; margin-bottom: 0.2rem;">סיסמה לעובד <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="user-password" required placeholder="לפחות 6 תווים" style="height: 44px; padding-top: 0; padding-bottom: 0;">
            </div>
            
            ${isSuperAdmin ? `
            <div class="form-group mb-0 flex-1" style="text-align: right; min-width: 150px;">
               <label class="form-label" for="user-org" style="font-size: 0.85rem; margin-bottom: 0.2rem;">שיוך לארגון</label>
               <select class="form-control" id="user-org" style="height: 44px; padding-top: 0; padding-bottom: 0;">
                  <option value="">-- בחר ארגון --</option>
                  ${organizations.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
               </select>
            </div>
            ` : ''}

            <div class="form-group mb-0 flex-1" style="text-align: right; min-width: 150px;">
               <label class="form-label" for="user-role" style="font-size: 0.85rem; margin-bottom: 0.2rem;">תפקיד במערכת</label>
               <select class="form-control" id="user-role" style="height: 44px; padding-top: 0; padding-bottom: 0;">
                  <option value="learner">לומד (Learner)</option>
                  <option value="org_admin">מנהל הדרכה (Admin)</option>
               </select>
            </div>
            
            <div class="flex flex-col gap-1 mb-0" style="min-width: fit-content;">
              <button type="submit" class="btn btn-primary" id="submit-btn" style="height: 44px; padding: 0 1.5rem; font-weight: 600; white-space: nowrap; width: 100%;">
                <i class='bx bx-user-plus' style="font-size: 1.1rem;"></i> <span>צור חשבון</span>
              </button>
              <button type="button" class="btn btn-outline hidden" id="cancel-edit-btn" style="height: 44px; white-space: nowrap; padding: 0 1.5rem; width: 100%;">
                ביטול
              </button>
            </div>
            <div id="user-msg" style="margin-top: 5px; text-align: center; font-weight: 500; min-height: 20px; width: 100%;" class="text-xs"></div>
         </form>
       </div>

       <!-- Table Section (Primary) -->
       <div class="card table-wrapper" style="grid-column: span 8; height: 100%;">
          <div class="flex justify-between items-center mb-6">
             <div>
               <h3 class="m-0" style="font-size: 1.25rem;">רשימת משתמשים פעילים</h3>
               <p class="text-xs text-muted">ניהול ומעקב אחר כלל המשתמשים המשוייכים למערכת</p>
             </div>
             ${!isSuperAdmin ? `
             <button class="btn btn-outline text-sm" id="reset-all-org-progress" style="color: hsl(var(--color-danger)); border-color: hsla(var(--color-danger), 0.3); padding: 0.5rem 1rem;">
                <i class='bx bx-refresh'></i> איפוס נתוני ארגון
             </button>
             ` : ''}
          </div>

          <!-- Search & Filters -->
          <div class="flex flex-wrap gap-4 mb-6" style="background: hsla(var(--text-main), 0.03); border: 1px solid hsla(var(--text-main), 0.05); padding: 1rem; border-radius: var(--radius-lg); align-items: stretch;">
            <!-- Search -->
            <div class="form-group mb-0" style="flex: 2; min-width: 200px; position: relative; height: 46px;">
              <i class='bx bx-search' style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: hsla(var(--text-main), 0.4); z-index: 10; font-size: 1.25rem; pointer-events: none;"></i>
              <input type="text" id="user-search" class="form-control" placeholder="חיפוש לפי שם, אימייל או טלפון..." 
                style="padding-right: 44px; height: 46px !important; width: 100%; padding-top: 0 !important; padding-bottom: 0 !important; line-height: 46px !important; border: 1px solid hsl(var(--border-color)) !important; box-sizing: border-box !important;">
            </div>
            
            <!-- Role Filter -->
            <div class="form-group mb-0" style="flex: 1; min-width: 150px; height: 46px;">
              <select id="filter-role" class="form-control" 
                style="height: 46px !important; padding: 0 1rem !important; line-height: 46px !important; border: 1px solid hsl(var(--border-color)) !important; box-sizing: border-box !important; appearance: auto;">
                <option value="">כל התפקידים</option>
                <option value="learner">עובד / לומד</option>
                <option value="org_admin">מנהל הדרכה</option>
              </select>
            </div>
            
            <!-- Org Filter -->
            ${isSuperAdmin ? `
            <div class="form-group mb-0" style="flex: 1; min-width: 180px; height: 46px;">
              <select id="filter-org" class="form-control" 
                style="height: 46px !important; padding: 0 1rem !important; line-height: 46px !important; border: 1px solid hsl(var(--border-color)) !important; box-sizing: border-box !important; appearance: auto;">
                <option value="">כל הארגונים</option>
                ${organizations.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
              </select>
            </div>
            ` : ''}
            
            <!-- Results Count -->
            <div id="results-count" class="text-xs text-muted font-medium ml-auto" style="white-space: nowrap; height: 46px; display: flex; align-items: center; padding: 0 0.5rem;">
              מציג 0 משתתפים
            </div>
          </div>

         <div style="overflow-x: auto;">
           <table class="table" id="users-table">
              <thead>
                  <tr>
                     <th style="width: 40px; padding: 1rem;"><input type="checkbox" id="select-all-users"></th>
                     <th style="padding: 1rem;" class="nowrap">שם מלא</th>
                     <th style="padding: 1rem;" class="nowrap">פרטי קשר</th>
                     ${isSuperAdmin ? '<th style="padding: 1rem;" class="nowrap">ארגון</th>' : ''}
                     <th style="padding: 1rem;">סטטוס</th>
                     <th style="padding: 1rem; width: 120px;">הצטרפות</th>
                     <th style="padding: 1rem; text-align: left;">פעולות</th>
                  </tr>
              </thead>
              <tbody>
                 <tr><td colspan="${isSuperAdmin ? 7 : 6}" style="text-align: center; padding: 3rem;"><i class='bx bx-loader bx-spin' style="font-size: 2rem; color: hsl(var(--color-primary));"></i><br><span class="mt-2 block">טוען משתמשים...</span></td></tr>
              </tbody>
           </table>
         </div>
       </div>

       <!-- Sidebar Actions Area (Excel Only now) -->
       <div class="flex flex-col gap-6" style="grid-column: span 4;">
         <div class="card" style="background: hsla(var(--color-primary), 0.02); border: 1px dashed hsla(var(--color-primary), 0.25);">
           <h3 class="mb-2" style="font-size: 1.1rem; color: hsl(var(--color-primary));"><i class='bx bx-file-import'></i> יבוא המוני (Excel)</h3>
           <p class="text-xs text-muted mb-4" style="line-height: 1.4;">הוסף כמות גדולה של עובדים בלחיצת כפתור אחת. פשוט הורד את התבנית, מלא והעלה חזרה.</p>
           
           <div class="flex flex-col gap-3">
             <button class="btn btn-outline btn-sm w-full justify-start" id="download-template-btn" style="background: white; border-color: hsla(var(--color-primary), 0.2); padding: 0.75rem;">
               <i class='bx bx-download' style="font-size: 1.1rem; color: hsl(var(--color-primary));"></i> <span style="flex-grow: 1;">הורדת תבנית אקסל</span>
             </button>
             <button class="btn btn-outline btn-sm w-full justify-start" id="upload-bulk-btn" style="background: white; border-color: hsla(var(--color-primary), 0.2); padding: 0.75rem;">
               <i class='bx bx-upload' style="font-size: 1.1rem; color: hsl(var(--color-primary));"></i> <span style="flex-grow: 1;">העלאת קובץ ורישום</span>
             </button>
             <input type="file" id="bulk-excel-input" accept=".xlsx, .xls" style="display: none;">
           </div>
           <div id="bulk-msg" style="margin-top: 15px; text-align: center; font-weight: 500;" class="text-xs"></div>
         </div>
       </div>
    </div>
  `

  const tableBody = container.querySelector('#users-table tbody');

  async function renderTable() {
    try {
      allUsers = await fetchUsers();
      console.log(`[LMS] renderTable - Users fetched:`, allUsers.length);
      
      const checkUser = getCurrentUserSync();
      if (!checkUser) {
          console.warn(`[LMS] renderTable - No current user during render, skipping table update`);
          return;
      }

      applyFilters();
    } catch (err) {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="${isSuperAdmin ? 7 : 6}" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה: ${err.message}</td></tr>`;
      }
    }
  }

  function applyFilters() {
    const searchTerm = container.querySelector('#user-search')?.value.toLowerCase() || '';
    const roleFilter = container.querySelector('#filter-role')?.value || '';
    const orgFilter = container.querySelector('#filter-org')?.value || '';

    const filteredUsers = allUsers.filter(u => {
      const matchesSearch = 
        u.full_name?.toLowerCase().includes(searchTerm) || 
        u.email?.toLowerCase().includes(searchTerm) || 
        u.phone?.includes(searchTerm);
      
      const matchesRole = !roleFilter || u.role === roleFilter;
      const matchesOrg = !orgFilter || u.org_id === orgFilter;

      return matchesSearch && matchesRole && matchesOrg;
    });

    const countLabel = container.querySelector('#results-count');
    if (countLabel) {
      countLabel.innerText = `מציג ${filteredUsers.length} מתוך ${allUsers.length} משתתפים`;
    }

    if (!tableBody) return;

    if (filteredUsers.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="${isSuperAdmin ? 7 : 6}" style="text-align: center;" class="text-muted">לא נמצאו משתמשים תואמים לחיפוש</td></tr>`
      return;
    }

    const html = filteredUsers.map(u => {
      try {
        return `
          <tr data-user-id="${u.id}">
             <td><input type="checkbox" class="user-checkbox" data-id="${u.id}" data-name="${u.full_name}" ${selectedUserIds.has(u.id) ? 'checked' : ''}></td>
             <td class="nowrap">
                <div style="font-weight: 500;">${u.full_name}</div>
                <div class="user-groups-list flex gap-1 mt-1 flex-wrap">
                  ${u.groups?.length > 0 
                    ? u.groups.map(g => `<span class="badge" style="font-size: 0.65rem; background: hsla(var(--color-primary), 0.1); color: hsl(var(--color-primary)); border: 1px solid hsla(var(--color-primary), 0.2);">${g.name}</span>`).join('') 
                    : '<span class="badge" style="font-size: 0.65rem; background: hsla(var(--color-warning), 0.1); color: hsl(var(--color-warning)); border: 1px solid hsla(var(--color-warning), 0.2);">לא משויך לקבוצה</span>'}
                </div>
                </div>
             </td>
             <td class="nowrap">
                ${u.email || '-'} <br>
                <span class="text-xs text-muted nowrap">
                  ${u.phone || 'אין טלפון'} • 
                  ${u.role === 'org_admin' ? 'מנהל הדרכה' : u.role === 'super_admin' ? 'מנהל על' : 'עובד / לומד'}
                </span>
             </td>
             ${isSuperAdmin ? `<td class="nowrap"><span class="text-sm">${u.org_name || '-'}</span></td>` : ''}
             <td><span class="badge ${u.status === 'פעיל' ? 'badge-success' : 'badge-warning'}">${u.status || 'פעיל'}</span></td>
             <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : '-'}</td>
             <td>
               <div class="flex gap-2">
                 <button class="btn btn-outline text-sm edit-btn" 
                   data-id="${u.id}" 
                   data-name="${u.full_name}" 
                   data-phone="${u.phone || ''}" 
                   data-email="${u.email || ''}" 
                   data-role="${u.role}" 
                   data-org="${u.org_id || ''}"
                   title="עריכת משתמש"><i class='bx bx-edit'></i></button>
                 <button class="btn btn-outline text-sm view-courses-btn" data-id="${u.id}" data-name="${u.full_name}" data-courses='${JSON.stringify(u.assigned_courses || []).replace(/'/g, "&apos;")}' title="צפייה בלומדות משויכות"><i class='bx bx-book-open'></i></button>
                 ${u.id !== currentUser.id ? `<button class="btn btn-outline text-sm impersonate-btn" data-id="${u.id}" data-name="${u.full_name}" title="התחזות למשתמש"><i class='bx bx-user-voice' style="color: hsl(var(--color-primary)); font-weight: bold;"></i></button>` : ''}
                 <button class="btn btn-outline text-sm reset-user-btn" data-id="${u.id}" data-name="${u.full_name}" title="איפוס נתוני למידה"><i class='bx bx-refresh' style="color: hsl(var(--color-warning));"></i></button>
                 ${u.id !== currentUser.id ? `<button class="btn btn-outline text-sm delete-btn" data-id="${u.id}" data-name="${u.full_name}" title="מחיקת חשבון"><i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i></button>` : ''}
               </div>
             </td>
          </tr>
        `;
      } catch (e) {
        console.error(`[LMS] Error rendering user ${u.id}:`, e);
        return '';
      }
    }).join('');
    
    tableBody.innerHTML = html;
    setupTableInteractions();
  }

  function setupTableInteractions() {
    // Setup edit buttons
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const btnEl = e.currentTarget;
        const form = document.getElementById('user-create-form');
        
        document.getElementById('form-title').innerText = 'עריכת משתמש';
        document.getElementById('user-name').value = btnEl.getAttribute('data-name');
        document.getElementById('user-phone').value = btnEl.getAttribute('data-phone');
        document.getElementById('user-email').value = (btnEl.getAttribute('data-email') !== '---' && btnEl.getAttribute('data-email')) ? btnEl.getAttribute('data-email') : '';
        document.getElementById('user-email').disabled = false; 
        document.getElementById('user-role').value = btnEl.getAttribute('data-role');
        
        if (isSuperAdmin) {
          document.getElementById('user-org').value = btnEl.getAttribute('data-org');
        }

        const pwField = document.getElementById('user-password');
        pwField.required = false;
        pwField.placeholder = 'אופציונלי: השאר ריק עבור סיסמה נוכחית';
        pwField.value = '';

        form.dataset.editId = btnEl.getAttribute('data-id');
        
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.querySelector('i').className = 'bx bx-save';
        submitBtn.querySelector('span').innerText = 'שמור שינויים';
        
        document.getElementById('cancel-edit-btn').classList.remove('hidden');
        document.getElementById('form-title').scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Setup delete buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        
        await showConfirmModal({
          title: 'מחיקת משתמש',
          message: `האם אתה בטוח שברצונך למחוק את <strong>${name}</strong>? פעולה זו תסיר את הגישה שלו לצמיתות.`,
          confirmText: 'מחק חשבון',
          onConfirm: async () => {
              await deleteUser(id);
              showToast('המשתמש נמחק בהצלחה');
              renderTable();
          }
        });
      });
    });

    // Setup individual reset buttons
    container.querySelectorAll('.reset-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        
        await showConfirmModal({
          title: 'אישור איפוס נתונים',
          message: `האם אתה בטוח שברצונך לאפס את כל נתוני הלמידה עבור <strong>${name}</strong>? פעולה זו תמחוק את כל ציוני הלומדות שלו לצמיתות.`,
          confirmText: 'אפס נתונים',
          onConfirm: async () => {
              await resetUserProgress(id);
              showToast(`נתוני הלמידה של ${name} אופסו`);
              renderTable();
          }
        });
      })
    })

    // Setup view courses buttons
    container.querySelectorAll('.view-courses-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        const courses = JSON.parse(e.currentTarget.getAttribute('data-courses'));
        const canManage = isSuperAdmin || currentUser?.role === 'org_admin';
        
        let availableCourses = [];
        if (canManage) {
          try {
            availableCourses = await fetchCourses();
          } catch (err) {
            console.error("Failed to fetch courses for modal", err);
          }
        }

        showCustomModal({
            title: `לומדות משויכות - ${name}`,
            content: `
                <div class="mb-4">
                    <p class="text-xs text-muted mb-4 font-medium">רשימת כל הלומדות המשויכות לעובד זה (באמצעות שיוך לקבוצה, שיוך ארגוני או שיוך ישיר):</p>
                    ${courses.length > 0 ? `
                        <ul class="list-none p-0 m-0 flex flex-col gap-2">
                            ${courses.map(c => `
                                <li class="p-3 border rounded-lg flex items-center justify-between gap-3" style="background: hsla(var(--text-main), 0.02); border-color: hsla(var(--text-main), 0.05);">
                                    <div class="flex items-center gap-3">
                                      <div style="width: 32px; height: 32px; border-radius: 8px; background: hsla(var(--color-primary), 0.1); color: hsl(var(--color-primary)); display: flex; align-items: center; justify-content: center;">
                                          <i class='bx bx-book' style="font-size: 1.25rem;"></i>
                                      </div>
                                      <div style="display: flex; flex-direction: column;">
                                        <span style="font-weight: 600;">${c.title}</span>
                                        <span class="text-xs text-muted" style="margin-top: 2px;">מקור: ${c.source || 'שיוך ישיר'}</span>
                                      </div>
                                    </div>
                                    ${canManage ? `
                                        <button class="btn btn-outline p-1 remove-course-btn" 
                                          style="border: none; color: hsl(var(--color-danger));" 
                                          data-course-id="${c.id}" 
                                          data-course-title="${c.title}" 
                                          title="הסר שיוך לומדה">
                                          <i class='bx bx-trash' style="font-size: 1.15rem;"></i>
                                        </button>
                                    ` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    ` : `
                        <div class="p-6 text-center text-muted" style="background: hsla(var(--text-main), 0.02); border-radius: var(--radius-lg); border: 1px dashed hsla(var(--text-main), 0.1);">
                            <i class='bx bx-info-circle' style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                            אין לומדות משויכות לעובד זה כרגע
                        </div>
                    `}
                </div>

                ${canManage ? `
                  <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed hsla(var(--text-main), 0.1);">
                    <h4 class="mb-3" style="font-size: 0.95rem;"><i class='bx bx-plus-circle'></i> שיוך לומדה חדשה באופן ישיר</h4>
                    <div class="flex gap-2">
                      <select class="form-control" id="modal-direct-assign-select" style="height: 48px; flex: 1;">
                        <option value="">-- בחר לומדה לשיוך --</option>
                        ${availableCourses.map(c => `
                          <option value="${c.id}" ${courses.some(ac => ac.id === c.id) ? 'disabled' : ''}>
                            ${c.title} ${courses.some(ac => ac.id === c.id) ? '(כבר משויך)' : ''}
                          </option>
                        `).join('')}
                      </select>
                      <button class="btn btn-primary" id="modal-direct-assign-btn" style="height: 48px; white-space: nowrap;">
                         שייך עכשיו
                      </button>
                    </div>
                  </div>
                ` : ''}
            `,
            footer: `
                <button class="btn btn-primary w-full" data-close>סגור</button>
            `
        });

        // Add event listeners to delete and add buttons within the modal
        const modalOverlay = document.querySelector('.modal-overlay');
        if (modalOverlay) {
          // Add logic
          const assignBtn = modalOverlay.querySelector('#modal-direct-assign-btn');
          if (assignBtn) {
            assignBtn.onclick = async () => {
              const courseId = modalOverlay.querySelector('#modal-direct-assign-select').value;
              if (!courseId) {
                showToast('עליך לבחור לומדה מהרשימה', 'warning');
                return;
              }
              assignBtn.disabled = true;
              assignBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
              try {
                await bulkAssignCourses([userId], courseId);
                showToast('הלומדה שוייכה בהצלחה');
                modalOverlay.querySelector('[data-close]').click();
                await renderTable();
              } catch (err) {
                showToast(err.message, 'error');
                assignBtn.disabled = false;
                assignBtn.innerHTML = "שייך עכשיו";
              }
            };
          }

          modalOverlay.querySelectorAll('.remove-course-btn').forEach(delBtn => {
            delBtn.onclick = async () => {
              const courseId = delBtn.dataset.courseId;
              const courseTitle = delBtn.dataset.courseTitle;

              await showConfirmModal({
                title: 'הסרת שיוך לומדה',
                message: `האם אתה בטוח שברצונך להסיר את השיוך של הלומדה <strong>${courseTitle}</strong> מהעובד <strong>${name}</strong>? פעולה זו תמחק גם את נתוני ההתקדמות שלו בלומדה זו לצמיתות.`,
                confirmText: 'הסר שיוך',
                onConfirm: async () => {
                  try {
                    await resetUserProgress(userId, courseId);
                    showToast('השיוך הוסר בהצלחה');
                    
                    // Close the current modal
                    const closeBtn = modalOverlay.querySelector('[data-close]');
                    if (closeBtn) closeBtn.click();
                    
                    // Refresh the table
                    await renderTable();
                  } catch (err) {
                    showToast('שגיאה בהסרת השיוך: ' + err.message, 'error');
                  }
                }
              });
            };
          });
        }
      });
    });




    // Setup impersonation buttons
    container.querySelectorAll('.impersonate-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        
        await showConfirmModal({
            title: 'אישור התחזות המערכת',
            message: `האם אתה בטוח שברצונך להתחזות למשתמש <strong>${name}</strong>? תוכל לראות את המערכת בדיוק כפי שהמשתמש רואה אותה.<br><br><strong>שימו לב:</strong> נתוני הלמידה וההתקדמות שתבצעו כעת יישמרו בשם המשתמש המתחזה.`,
            confirmText: 'התחל התחזות',
            type: 'info',
            onConfirm: async () => {
                const targetUser = allUsers.find(u => u.id === userId);
                if (targetUser) {
                    await impersonateUser(targetUser);
                }
            }
        });
      });
    });

    // Update Select All checkbox state based on current visible checkboxes
    const selectAll = container.querySelector('#select-all-users');
    if (selectAll) {
      const allCb = Array.from(container.querySelectorAll('.user-checkbox'));
      if (allCb.length > 0) {
        selectAll.checked = allCb.every(cb => cb.checked);
        selectAll.indeterminate = !selectAll.checked && allCb.some(cb => cb.checked);
      } else {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }
    }
  }

  // Setup Org-wide reset button (once)
  const resetAllBtn = container.querySelector('#reset-all-org-progress');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', async () => {
      await showConfirmModal({
        title: 'אזהרה קריטית!',
        message: 'אתה עומד לאפס את <strong>כל נתוני הלמידה</strong> של כל העובדים בארגון. פעולה זו אינה הפיכה! האם להמשיך?',
        confirmText: 'אפס הכל (קריטי)',
        onConfirm: async () => {
            await resetOrgProgress(currentUser.orgId);
            showToast('כל נתוני הלמידה בארגון אופסו');
            renderTable();
        }
      });
    })
  }

  // Search & Filter event listeners
  container.querySelector('#user-search')?.addEventListener('input', applyFilters);
  container.querySelector('#filter-role')?.addEventListener('change', applyFilters);
  container.querySelector('#filter-org')?.addEventListener('change', applyFilters);

  await renderTable();

  // Form Reset Helper
  const resetFormToCreate = () => {
    form.reset()
    document.getElementById('form-title').innerText = 'יצירת משתמש חדש'
    document.getElementById('user-email').disabled = false
    const pwField = document.getElementById('user-password')
    pwField.required = true
    pwField.placeholder = 'לפחות 6 תווים'
    delete form.dataset.editId
    
    const submitBtn = document.getElementById('submit-btn')
    if (submitBtn) {
      submitBtn.querySelector('i').className = 'bx bx-user-plus'
      submitBtn.querySelector('span').innerText = 'צור חשבון'
    }
    document.getElementById('cancel-edit-btn').classList.add('hidden')
  }

  // Handle Cancel Edit
  container.querySelector('#cancel-edit-btn').addEventListener('click', () => {
    resetFormToCreate()
    document.getElementById('user-msg').innerHTML = ''
  })

  // Handle Create/Update User
  const form = container.querySelector('#user-create-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const msg = document.getElementById('user-msg')
    const submitBtn = form.querySelector('button[type="submit"]')
    const isEdit = !!form.dataset.editId
    
    const rawPhone = document.getElementById('user-phone').value.trim();
    const userData = {
      fullName: document.getElementById('user-name').value.trim(),
      email: document.getElementById('user-email').value.trim(),
      phone: rawPhone,
      password: document.getElementById('user-password').value,
      role: document.getElementById('user-role').value
    }

    if (isSuperAdmin) {
        userData.orgId = document.getElementById('user-org').value;
        if (!userData.orgId && userData.role !== 'super_admin') {
            msg.style.color = 'hsl(var(--color-danger))';
            msg.innerHTML = 'עליך לבחור ארגון עבור משתמש שאינו מנהל על.';
            return;
        }
    }

    if (userData.phone) {
      // Allow mobile (05X), landline (02,03,04,08,09) and VOIP (07X)
      const phoneRegex = /^0(5\d|7\d|[23489])-?\d{7}$/;
      if (!phoneRegex.test(userData.phone)) {
        msg.style.color = 'hsl(var(--color-danger))';
        msg.innerHTML = 'שגיאה: מספר טלפון לא תקין (צריך להתחיל ב-0 ולהכיל 9-10 ספרות).';
        setTimeout(() => { msg.innerHTML = '' }, 4000);
        return;
      }
    }

    submitBtn.disabled = true
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> <span>מבצע...</span>`
    
    try {
      if (isEdit) {
        await updateUser(form.dataset.editId, userData);
        showToast('פרטי המשתמש עודכנו');
      } else {
        await createUser(userData);
        showToast('המשתמש הוקם בהצלחה');
      }
      
      await renderTable();
      resetFormToCreate();
    } catch (err) {
      msg.style.color = 'hsl(var(--color-danger))';
      msg.innerHTML = 'שגיאה: ' + err.message;
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = isEdit 
      ? `<i class='bx bx-save'></i> <span>שמור שינויים</span>`
      : `<i class='bx bx-user-plus'></i> <span>צור חשבון</span>`
    }
  })

  // Initialize selection bar state
  updateBulkBar();

  // Handle Selection Change
  container.addEventListener('change', (e) => {
    const target = e.target;
    
    // 1. Select All Checkbox
    if (target.id === 'select-all-users') {
      const isChecked = target.checked;
      container.querySelectorAll('.user-checkbox').forEach(cb => {
        cb.checked = isChecked;
      });
      updateBulkBar();
    } 
    // 2. Individual Checkbox
    else if (target.classList.contains('user-checkbox')) {
      // Update Select All checkbox state based on others
      const allCb = Array.from(container.querySelectorAll('.user-checkbox'));
      const selectAll = container.querySelector('#select-all-users');
      if (selectAll) {
        selectAll.checked = allCb.every(cb => cb.checked);
        selectAll.indeterminate = !selectAll.checked && allCb.some(cb => cb.checked);
      }
      updateBulkBar();
    }
  });

  // Handle 'Clear Selection' button in the bulk bar
  container.querySelector('#clear-selection-btn').addEventListener('click', () => {
    container.querySelectorAll('.user-checkbox, #select-all-users').forEach(cb => cb.checked = false);
    updateBulkBar();
  });

  // Bulk Group Assignment
  container.querySelector('#bulk-group-btn').addEventListener('click', async () => {
    try {
      if (selectedUserIds.size === 0) return;

      const groups = await fetchGroups();
      const usersSelection = Array.from(selectedUserIds).map(id => {
          const row = tableBody.querySelector(`tr[data-user-id="${id}"]`);
          const cb = row ? row.querySelector('.user-checkbox') : null;
          return { id, full_name: cb?.dataset.name || 'משתמש' };
      });

      await showBulkGroupModal({
        users: usersSelection,
        groups: groups,
        onAssign: async (groupId) => {
            await assignUsersToGroup(groupId, Array.from(selectedUserIds));
            showToast('המשתמשים שוייכו לקבוצה בהצלחה');
            selectedUserIds.clear();
            container.querySelectorAll('.user-checkbox, #select-all-users').forEach(cb => cb.checked = false);
            updateBulkBar();
        }
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bulk Delete
  container.querySelector('#bulk-delete-btn').addEventListener('click', async () => {
    const userIds = Array.from(selectedUserIds).filter(id => id !== currentUser.id);
    if (userIds.length === 0) {
        showToast('לא ניתן למחוק את המשתמש המחובר כרגע', 'warning');
        return;
    }
    await showConfirmModal({
        title: 'מחיקה קבוצתית',
        message: `האם אתה בטוח שברצונך למחוק לצמיתות את <strong>${userIds.length}</strong> המשתמשים שנבחרו? פעולה זו אינה הפיכה.`,
        confirmText: 'מחק הכל',
        onConfirm: async () => {
            try {
              showToast('מוחק משתמשים...', 'info');
              const results = await bulkDeleteUsers(userIds);
              const successCount = results.filter(r => r.status === 'success').length;
              const failCount = results.length - successCount;
              
              if (successCount > 0) {
                showToast(`${successCount} משתמשים נמחקו בהצלחה`);
              }
              if (failCount > 0) {
                showToast(`${failCount} משתמשים נכשלו במחיקה`, 'error');
              }
              
              selectedUserIds.clear();
              updateBulkBar();
              await renderTable();
            } catch (err) {
              showToast(err.message, 'error');
            }
        }
    });
  });


  // Bulk Move Org
  const bulkMoveBtn = container.querySelector('#bulk-move-org-btn');
  if (bulkMoveBtn) {
    bulkMoveBtn.addEventListener('click', async () => {
      const usersSelection = Array.from(selectedUserIds).map(id => {
          const row = tableBody.querySelector(`tr[data-user-id="${id}"]`);
          const cb = row.querySelector('.user-checkbox');
          return { id, full_name: cb?.dataset.name || 'משתמש' };
      });

      await showBulkOrgModal({
        users: usersSelection,
        organizations,
        onAssign: async (newOrgId) => {
            await bulkUpdateUsersOrg(Array.from(selectedUserIds), newOrgId);
            showToast('המשתמשים הועברו בהצלחה לארגון החדש');
            selectedUserIds.clear();
            updateBulkBar();
            renderTable();
        }
      });
    });
  }

  // Bulk Role Change
  const bulkRoleBtn = container.querySelector('#bulk-role-btn');
  if (bulkRoleBtn) {
    bulkRoleBtn.addEventListener('click', async () => {
      const usersSelection = Array.from(selectedUserIds).map(id => {
          const row = tableBody.querySelector(`tr[data-user-id="${id}"]`);
          const cb = row.querySelector('.user-checkbox');
          return { id, full_name: cb?.dataset.name || 'משתמש' };
      });

      await showBulkRoleModal({
        users: usersSelection,
        onAssign: async (newRole) => {
            showToast('מעדכן תפקידים...', 'info');
            await bulkUpdateUsersRole(Array.from(selectedUserIds), newRole);
            showToast('התפקידים עודכנו בהצלחה');
            selectedUserIds.clear();
            updateBulkBar();
            renderTable();
        }
      });
    });
  }

  // === Excel Bulk Import/Export Logic ===
  
  const bulkInput = container.querySelector('#bulk-excel-input');
  const bulkMsg = container.querySelector('#bulk-msg');

  container.querySelector('#download-template-btn').addEventListener('click', () => {
    const headers = [['שם מלא', 'אימייל', 'טלפון', 'סיסמה', 'תפקיד (learner/org_admin)', 'שיוך לקבוצה']];
    if (isSuperAdmin) {
      headers[0].push('מזהה ארגון (Org ID)');
    }
    
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'תבנית עובדים');
    XLSX.writeFile(workbook, 'lms_users_template.xlsx');
    showToast('התבנית הורדה בהצלחה');
  });

  container.querySelector('#upload-bulk-btn').addEventListener('click', () => {
    bulkInput.click();
  });

  bulkInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    bulkMsg.style.color = 'hsl(var(--text-main))';
    bulkMsg.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> קורא קובץ...`;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          throw new Error('הקובץ ריק או לא בפורמט התקין');
        }

        bulkMsg.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מעבד ${data.length} משתמשים...`;
        
        bulkMsg.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שולח ${data.length} משתמשים לשרת...`;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const usersToBatch = [];
        const skippedRows = [];

        data.forEach((row, index) => {
          const fullName = (row['שם מלא'] || row['Full Name'])?.toString().trim();
          const email = (row['אימייל'] || row['Email'])?.toString().trim().toLowerCase();
          const phone = row['טלפון'] || row['Phone'];
          const password = row['סיסמה'] || row['Password'] || 'Lms123456'; 
          const role = row['תפקיד (learner/org_admin)'] || row['Role'] || 'learner';
          const orgId = row['מזהה ארגון (Org ID)'] || row['Org ID'];
          const groupName = (row['שיוך לקבוצה'] || row['Group Name'])?.toString().trim();

          if (fullName && email && emailRegex.test(email)) {
            usersToBatch.push({
              fullName,
              email,
              phone: phone ? phone.toString() : '',
              password: password.toString(),
              role,
              orgId: isSuperAdmin ? orgId : currentUser.orgId,
              groupName
            });
          } else {
            skippedRows.push({ index: index + 2, name: fullName, email: email });
          }
        });

        if (skippedRows.length > 0) {
          console.warn('Skipped invalid rows:', skippedRows);
        }

        if (usersToBatch.length === 0) {
          throw new Error('לא נמצאו משתמשים תקינים (ודא שהאימייל תקין והשם מלא מלא)');
        }

        const batchResults = await bulkCreateUsers(usersToBatch);
        
        const successCount = batchResults.filter(r => r.status === 'success').length;
        const failCount = batchResults.length - successCount;

        if (successCount > 0) {
          showToast(`${successCount} משתמשים נוספו בהצלחה`);
          await renderTable();
        }

        if (failCount > 0) {
          bulkMsg.style.color = 'hsl(var(--color-danger))';
          bulkMsg.innerHTML = `הושלם עם שגיאות: ${successCount} הצליחו, ${failCount} נכשלו. בדוק את הקונסול (F12) לפרטים.`;
          console.warn('Bulk import errors (Detailed):', batchResults.filter(r => r.status === 'error'));

        } else {
          bulkMsg.style.color = 'hsl(var(--color-success))';
          bulkMsg.innerHTML = `כל ${successCount} המשתמשים נוספו בהצלחה!`;
          setTimeout(() => { bulkMsg.innerHTML = '' }, 5000);
        }

      } catch (err) {
        bulkMsg.style.color = 'hsl(var(--color-danger))';
        bulkMsg.innerHTML = 'שגיאה: ' + err.message;
      } finally {
        bulkInput.value = '';
      }
    };
    reader.onerror = () => {
      bulkMsg.style.color = 'hsl(var(--color-danger))';
      bulkMsg.innerHTML = 'שגיאה בקריאת הקובץ';
      bulkInput.value = '';
    };
    reader.readAsBinaryString(file);
  });
}
