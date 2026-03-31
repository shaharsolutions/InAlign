import { fetchCategories, addCategory, updateCategory, deleteCategory } from '../api/categoriesApi.js'
import { fetchCourses } from '../api/coursesApi.js'
import { fetchOrganizationById, updateOrganization, fetchOrganizations } from '../api/orgApi.js'
import { getCurrentUserSync } from '../api/authApi.js'
import { showConfirmModal, showToast, showPrompt, applyOrganizationStyles } from '../lib/ui.js'

export default async function renderSuperAdminSettings(container) {
  const user = getCurrentUserSync();
  const orgId = user?.orgId;
  
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">הגדרות מערכת</h1>
      <p class="text-muted">ניהול פרמטרים גלובליים, מיתוג וקטגוריות של לומדות.</p>
    </div>

    <div class="grid grid-cols-1 gap-6 fade-in">
       <!-- Branding Section (Conditional) -->
       ${orgId ? `
       <div class="card" id="branding-section">
          <h3 class="mb-4"><i class='bx bx-palette'></i> מיתוג ועיצוב הארגון</h3>
          <div id="branding-loader" class="text-center p-4"><i class='bx bx-loader bx-spin'></i> טוען הגדרות...</div>
          <form id="branding-form" class="hidden">
             <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                   <label class="form-label">שם הארגון</label>
                   <input class="form-control" type="text" id="branding-name" required>
                </div>
                <div class="form-group">
                   <label class="form-label">צבע ראשי</label>
                   <div style="display: flex; gap: 8px; align-items: center;">
                      <input type="color" id="branding-color" style="width: 45px; height: 45px; border:none; padding:0; border-radius: 4px; cursor: pointer;">
                      <input class="form-control" type="text" id="branding-color-hex" maxlength="7" style="font-family: monospace; text-transform: uppercase;">
                   </div>
                </div>
             </div>
             <div class="form-group mt-3">
                <label class="form-label">קישור ללוגו (URL)</label>
                <div style="display: flex; gap: 12px; align-items: center;">
                   <input class="form-control" type="url" id="branding-logo" placeholder="https://domain.com/logo.png">
                   <img id="branding-preview" src="" style="width: 50px; height: 50px; object-fit: contain; border-radius: 4px; background: #eee; display: none;">
                </div>
             </div>
             
             <hr style="margin: 2rem 0; border: 0; border-top: 1px solid hsla(var(--text-main), 0.1);">
             
             <h3 class="mb-4"><i class='bx bx-paper-plane'></i> תקשורת והדרכה (Onboarding)</h3>
             <div class="form-group">
                <label class="form-label">הודעת ברוכים הבאים לעובדים</label>
                <textarea class="form-control" id="branding-welcome" placeholder="לדוגמה: ברוכים הבאים למרכז הלמידה של החברה" style="height: 120px; resize: vertical;"></textarea>
                <p class="text-xs text-muted mt-1" id="welcome-hint">הודעה זו תופיע בראש הדף הראשי של כל עובד בארגון (מוגבל לעד 5 שורות).</p>
             </div>

             <div class="form-group mt-4">
                <label class="form-label">שיוך אוטומטי לעובד חדש</label>
                <div id="branding-auto-enroll-container" class="form-control" style="height: auto; max-height: 200px; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 10px; background: hsl(var(--bg-body));">
                   <div class="text-muted text-sm">טוען לומדות...</div>
                </div>
                <p class="text-xs text-muted mt-1">בחר את כל הלומדות שיוקצו אוטומטית לכל עובד חדש שנוצר בארגון.</p>
             </div>

             <button type="submit" id="branding-save-btn" class="btn btn-primary mt-4 py-3 px-8">
                <i class='bx bx-save'></i> שמור את כל ההגדרות
             </button>
          </form>
       </div>
       ` : ''}

        <div class="grid grid-cols-12 gap-6">
           <!-- Categories Management Section -->
           <div class="card" style="grid-column: 1 / -1;">
            <h3 class="mb-3">ניהול קטגוריות לומדות</h3>
            
            ${user?.role === 'super_admin' ? `
            <div class="form-group mb-6" style="background: hsl(var(--color-primary)/0.05); padding: 1rem; border-radius: 8px; border: 1px dashed hsl(var(--color-primary)/0.3);">
                <label class="form-label text-primary"><i class='bx bx-filter-alt'></i> בחר ארגון לניהול קטגוריות</label>
                <select id="settings-org-filter" class="form-control">
                   <option value="">-- טוען ארגונים... --</option>
                </select>
            </div>
            ` : ''}

            <form id="category-form">
               <div class="form-group" style="text-align: right;">
                  <label class="form-label" for="category-name">שם הקטגוריה החדשה</label>
                  <input class="form-control" type="text" id="category-name" required placeholder="לדוגמה: בטיחות בעבודה">
               </div>
               <button type="submit" id="add-cat-btn" class="btn btn-primary w-full justify-center mt-4">
                 <i class='bx bx-plus'></i> הוסף קטגוריה
               </button>
            </form>
          </div>

           <!-- Categories List Table Section -->
           <div class="card table-wrapper" style="grid-column: 1 / -1;">
            <div class="flex flex-wrap justify-between items-center mb-4 gap-4">
               <h3 class="m-0">רשימת קטגוריות</h3>
               <div id="current-org-label" class="badge badge-primary"></div>
            </div>
            <table class="table" id="categories-table">
               <thead>
                  <tr>
                     <th>שם הקטגוריה</th>
                     <th>תאריך יצירה</th>
                     <th>פעולות</th>
                  </tr>
               </thead>
               <tbody>
                  <tr><td colspan="3" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען קטגוריות...</td></tr>
               </tbody>
            </table>
          </div>
       </div>
    </div>
  `

  const tableBody = container.querySelector('#categories-table tbody')
  const orgFilter = container.querySelector('#settings-org-filter');
  const orgLabel = container.querySelector('#current-org-label');
  let currentActiveOrgId = user?.role === 'super_admin' ? null : orgId;

  async function renderCategoriesTable() {
    try {
      if (user?.role === 'super_admin' && !currentActiveOrgId) {
          tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem;" class="text-muted">
            <div style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.5rem;"><i class='bx bx-search-alt'></i></div>
            אנא בחר ארגון מתיבת הסינון למעלה כדי לנהל את הקטגוריות שלו
          </td></tr>`;
          if (orgLabel) orgLabel.style.display = 'none';
          return;
      }

      tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען...</td></tr>`;
      
      const categories = await fetchCategories(currentActiveOrgId);
      
      if (orgLabel) {
          if (currentActiveOrgId) {
             const orgInfo = (orgFilter && orgFilter.options[orgFilter.selectedIndex]) ? orgFilter.options[orgFilter.selectedIndex].text : 'ארגון נבחר';
             orgLabel.innerText = orgInfo;
             orgLabel.style.display = 'inline-flex';
          } else {
             orgLabel.style.display = 'none';
          }
      }

      if (categories.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center;" class="text-muted">${currentActiveOrgId ? 'אין קטגוריות לארגון זה' : 'בחר ארגון כדי לראות קטגוריות'}</td></tr>`
        return
      }

      tableBody.innerHTML = categories.map(cat => `
        <tr>
           <td><div style="font-weight: 500;">${cat.name}</div></td>
           <td>${new Date(cat.created_at).toLocaleDateString('he-IL')}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm edit-cat-btn" data-id="${cat.id}" data-name="${cat.name}" title="ערוך"><i class='bx bx-edit-alt'></i></button>
               <button class="btn btn-outline text-sm delete-cat-btn" data-id="${cat.id}" data-name="${cat.name}" title="מחק"><i class='bx bx-trash text-danger'></i></button>
             </div>
           </td>
        </tr>
      `).join('')

      // Event Listeners for Edit
      container.querySelectorAll('.edit-cat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const currentName = e.currentTarget.getAttribute('data-name');
          
          const newName = await showPrompt({ 
            title: 'עריכת קטגוריה', 
            message: 'הזן שם חדש עבור הקטגוריה:', 
            defaultValue: currentName 
          });
          
          if (newName && newName !== currentName) {
            try {
              await updateCategory(id, newName);
              showToast('הקטגוריה עודכנה בהצלחה');
              renderCategoriesTable();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });

      // Event Listeners for Delete
      container.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const name = e.currentTarget.getAttribute('data-name');
          
          await showConfirmModal({
            title: 'מחיקת קטגוריה',
            message: `האם אתה בטוח שברצונך למחוק את הקטגוריה <strong>${name}</strong>? שינוי זה עלול להשפיע על לומדות המשויכות אליה.`,
            confirmText: 'מחק',
            onConfirm: async () => {
                await deleteCategory(id);
                showToast('הקטגוריה נמחקה בהצלחה');
                renderCategoriesTable();
            }
          });
        });
      });

    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-danger text-center">שגיאה: ${err.message}</td></tr>`
    }
  }

  // --- Branding Logic ---
  if (orgId) {
    const brandingForm = container.querySelector('#branding-form');
    const brandingLoader = container.querySelector('#branding-loader');
    const colorPicker = container.querySelector('#branding-color');
    const colorHex = container.querySelector('#branding-color-hex');
    const logoInput = container.querySelector('#branding-logo');
    const previewImg = container.querySelector('#branding-preview');
    const nameInput = container.querySelector('#branding-name');
    const welcomeInput = container.querySelector('#branding-welcome');
    const autoEnrollContainer = container.querySelector('#branding-auto-enroll-container');

    async function loadBranding() {
      const loader = container.querySelector('#branding-loader');
      const form = container.querySelector('#branding-form');
      if (!loader || !form) {
        console.warn("[InAlign] Branding loader or form elements not found in DOM.");
        return;
      }

      console.log(`[InAlign] loadBranding() starting for orgId: ${orgId}`);
      try {
        const [org, courses] = await Promise.all([
          fetchOrganizationById(orgId).catch(err => {
             console.error("[LMS] fetchOrganizationById failed:", err);
             throw err;
          }),
          fetchCourses().catch(err => {
             console.error("[LMS] fetchCourses failed:", err);
             throw err;
          })
        ]);

        console.log("[InAlign] loadBranding data fetched successfully", { org: !!org, coursesCount: courses?.length });

        if (org) {
          nameInput.value = org.name || '';
          colorPicker.value = org.primary_color || '#0066FF';
          colorHex.value = (org.primary_color || '#0066FF').toUpperCase();
          logoInput.value = org.logo_url || '';
          welcomeInput.value = org.welcome_message || '';
          
          if (org.logo_url) {
            previewImg.src = org.logo_url;
            previewImg.style.display = 'block';
          } else {
            previewImg.style.display = 'none';
          }

          // Populate auto-enroll list with checkboxes
          const selectedIds = org.auto_enroll_course_ids || [];
          autoEnrollContainer.innerHTML = (courses && courses.length > 0) 
            ? courses.map(c => `
                <label class="flex items-center gap-3 cursor-pointer hover:bg-surface-hover p-1 rounded transition-colors">
                   <input type="checkbox" class="auto-enroll-checkbox" value="${c.id}" ${selectedIds.includes(c.id) ? 'checked' : ''} style="width: 18px; height: 18px;">
                   <span class="text-sm font-medium">${c.title}</span>
                </label>
              `).join('') 
            : '<div class="text-muted text-sm">לא נמצאו לומדות זמינות</div>';

          form.classList.remove('hidden');
        } else {
          console.warn("[InAlign] Organization data not found for ID:", orgId);
          showToast('נתוני הארגון לא נמצאו', 'warning');
        }
      } catch (err) {
        console.error("[InAlign] loadBranding encountered an error:", err);
        showToast('טעינת הגדרות מיתוג נכשלה: ' + err.message, 'error');
      } finally {
        if (loader) loader.classList.add('hidden');
      }
    }

    // Line limit logic for Welcome Message
    welcomeInput.addEventListener('input', () => {
        const lines = welcomeInput.value.split('\n');
        if (lines.length > 5) {
            welcomeInput.value = lines.slice(0, 5).join('\n');
            const hint = container.querySelector('#welcome-hint');
            if (hint) {
                hint.classList.add('text-danger');
                hint.innerText = 'הגעת למגבלת ה-5 שורות המותרות.';
                setTimeout(() => {
                    hint.classList.remove('text-danger');
                    hint.innerText = 'הודעה זו תופיע בראש הדף הראשי של כל עובד בארגון (מוגבל לעד 5 שורות).';
                }, 3000);
            }
        }
    });

    colorPicker.addEventListener('input', (e) => colorHex.value = e.target.value.toUpperCase());
    colorHex.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) colorPicker.value = e.target.value;
    });

    logoInput.addEventListener('input', (e) => {
        if (e.target.value) {
            previewImg.src = e.target.value;
            previewImg.style.display = 'block';
        } else {
            previewImg.style.display = 'none';
        }
    });

    brandingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('branding-save-btn');
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שומר...`;

        try {
            const selectedCourseIds = Array.from(container.querySelectorAll('.auto-enroll-checkbox:checked')).map(cb => cb.value);

            const updatedOrg = await updateOrganization(
                orgId, 
                nameInput.value, 
                colorPicker.value, 
                logoInput.value,
                welcomeInput.value,
                selectedCourseIds
            );
            showToast('ההגדרות נשמרו בהצלחה!');
            
            // Re-apply styles if user is looking at their own org branding
            if (user.orgId === orgId) {
                applyOrganizationStyles({ ...user, orgName: updatedOrg.name, logo: updatedOrg.logo_url, primaryColor: updatedOrg.primary_color });
            }
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class='bx bx-save'></i> שמור שינויים`;
        }
    });

    loadBranding();
  }

  // --- Categories Form Submission ---
  const form = container.querySelector('#category-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    
    if (user?.role === 'super_admin' && !currentActiveOrgId) {
        showToast('אנא בחר ארגון לפני הוספת קטגוריה', 'warning');
        return;
    }

    const nameInput = document.getElementById('category-name')
    const name = nameInput.value.trim()
    if (!name) return

    const submitBtn = document.getElementById('add-cat-btn')
    submitBtn.disabled = true
    
    try {
      await addCategory(name, currentActiveOrgId);
      showToast('קטגוריה נוספה בהצלחה');
      await renderCategoriesTable();
      form.reset();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false
    }
  })

  // --- Super Admin Filter Initialization ---
  if (user?.role === 'super_admin' && orgFilter) {
      try {
          const orgs = await fetchOrganizations();
          orgFilter.innerHTML = `<option value="">-- בחר ארגון --</option>` + 
            orgs.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
          
          orgFilter.onchange = (e) => {
              currentActiveOrgId = e.target.value;
              renderCategoriesTable();
          };
      } catch (err) {
          console.error("Failed to load orgs for filter", err);
      }
  }

  await renderCategoriesTable();
}
