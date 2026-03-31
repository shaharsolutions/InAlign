/**
 * Shared UI Components and Helpers
 */

/**
 * Show a modern confirmation modal
 */
export function showConfirmModal({ title, message, type = 'danger', confirmText = 'אישור', cancelText = 'ביטול', onConfirm }) {
    const modal = document.createElement('div');
    const color = type === 'danger' ? 'hsl(var(--color-danger))' : 'hsl(var(--color-primary))';
    const icon = type === 'danger' ? 'bx-error-alt' : 'bx-info-circle';
    
    modal.className = 'modal-overlay';
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 450px; width: 90%; text-align: center; padding: 2.5rem; border-top: 5px solid ${color};">
        <div style="font-size: 3.5rem; color: ${color}; margin-bottom: 1rem;">
           <i class='bx ${icon}'></i>
        </div>
        <h2 class="mb-2">${title}</h2>
        <p class="text-muted mb-6" style="font-size: 1.1rem; line-height: 1.6;">${message}</p>
        <div class="flex gap-3 justify-center">
           <button class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'} px-8" id="modal-confirm">
              ${confirmText}
           </button>
           <button class="btn btn-outline px-8" id="modal-cancel">${cancelText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        modal.querySelector('#modal-cancel').onclick = () => {
            modal.remove();
            resolve(false);
        };
        
        modal.querySelector('#modal-confirm').onclick = async () => {
            const btn = modal.querySelector('#modal-confirm');
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מבצע...`;
            
            try {
                if (onConfirm) await onConfirm();
                resolve(true);
            } catch (err) {
                console.error("Modal Action Failed:", err);
                resolve(false);
            } finally {
                modal.remove();
            }
        };
    });
}

/**
 * Show a modern alert modal (HTML replacement for window.alert)
 */
export function showAlert({ title = 'הודעה', message, type = 'info', confirmText = 'הבנתי' }) {
    const modal = document.createElement('div');
    const color = type === 'danger' ? 'hsl(var(--color-danger))' : 
                  type === 'success' ? '#10b981' : 
                  'hsl(var(--color-primary))';
    const icon = type === 'danger' ? 'bx-error-alt' : 
                 type === 'success' ? 'bx-check-circle' : 
                 'bx-info-circle';
    
    modal.className = 'modal-overlay';
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 450px; width: 90%; text-align: center; padding: 2.5rem; border-top: 5px solid ${color};">
        <div style="font-size: 3.5rem; color: ${color}; margin-bottom: 1rem;">
           <i class='bx ${icon}'></i>
        </div>
        <h2 class="mb-2">${title}</h2>
        <p class="text-muted mb-6" style="font-size: 1.1rem; line-height: 1.6;">${message}</p>
        <div class="flex justify-center">
           <button class="btn btn-primary px-12" id="modal-ok">
              ${confirmText}
           </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        modal.querySelector('#modal-ok').onclick = () => {
            modal.remove();
            resolve(true);
        };
    });
}

/**
 * Show a modern prompt modal (HTML replacement for window.prompt)
 */
export function showPrompt({ title, message, defaultValue = '', placeholder = '', confirmText = 'אישור', cancelText = 'ביטול' }) {
    const modal = document.createElement('div');
    const color = 'hsl(var(--color-primary))';
    
    modal.className = 'modal-overlay';
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 450px; width: 90%; padding: 2.5rem; border-top: 5px solid ${color};">
        <h2 class="mb-2 text-center">${title}</h2>
        <p class="text-muted mb-4 text-center" style="font-size: 1rem;">${message}</p>
        
        <div class="form-group mb-6">
            <input type="text" id="prompt-input" class="form-control" value="${defaultValue}" placeholder="${placeholder}" autofocus style="height: 48px;">
        </div>

        <div class="flex gap-3 justify-center">
           <button class="btn btn-primary px-8" id="modal-confirm">
              ${confirmText}
           </button>
           <button class="btn btn-outline px-8" id="modal-cancel">${cancelText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#prompt-input');
    input.focus();
    input.select();

    return new Promise((resolve) => {
        const handleConfirm = () => {
            const value = input.value;
            modal.remove();
            resolve(value);
        };

        modal.querySelector('#modal-cancel').onclick = () => {
            modal.remove();
            resolve(null);
        };
        
        modal.querySelector('#modal-confirm').onclick = handleConfirm;
        
        input.onkeydown = (e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') {
                modal.remove();
                resolve(null);
            }
        };
    });
}

/**
 * Show a custom modal with any HTML content
 */
export function showCustomModal({ title, content, footer, onClose }) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 500px; width: 95%; padding: 2rem; border-top: 5px solid hsl(var(--color-primary)); text-align: right;">
        <div class="flex justify-between items-center mb-6">
            <h2 class="m-0">${title}</h2>
            <button class="btn btn-outline p-1" id="modal-close-icon" style="border:none;"><i class='bx bx-x' style="font-size: 1.5rem;"></i></button>
        </div>
        <div class="modal-body mb-6">
            ${content}
        </div>
        <div class="modal-footer flex gap-3">
            ${footer || ''}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        const close = () => {
            modal.remove();
            if (onClose) onClose();
            resolve(null);
        };
        
        modal.querySelector('#modal-close-icon').onclick = close;
        
        // Expose close to children
        modal.close = close;
        
        // Any buttons with 'data-close' will close the modal
        modal.querySelectorAll('[data-close]').forEach(btn => {
            btn.onclick = close;
        });
    });
}
export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const bg = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#ef4444';
    
    toast.style = `
        position: fixed; bottom: 20px; right: 20px; 
        background: ${bg}; color: white; padding: 12px 24px; 
        border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        z-index: 10000; animation: slideInUp 0.3s ease;
        font-weight: 500; display: flex; align-items: center; gap: 8px;
    `;
    
    const icon = type === 'success' ? 'bx-check-circle' : type === 'warning' ? 'bx-error' : 'bx-x-circle';
    toast.innerHTML = `<i class='bx ${icon}' style='font-size: 1.25rem'></i> <span>${message}</span>`;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show a modal to edit learner progress
 */
export async function showEditProgressModal({ record, onSave, onDelete }) {
    const modal = document.createElement('div');
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    // Map status strings (Hebrew or EN) to values
    const getStatusValue = (s) => {
        if (s === 'הושלם' || s === 'completed') return 'completed';
        if (s === 'בתהליך' || s === 'in_progress') return 'in_progress';
        return 'not_started';
    };
    
    const dbStatus = getStatusValue(record.status);
    const scoreVal = (record.score === '-' || record.score === null) ? '' : record.score;

    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 500px; width: 95%; padding: 2rem; border-top: 5px solid hsl(var(--color-primary));">
        <div class="flex justify-between items-center mb-4">
            <h2 class="m-0">עדכון רישום למידה</h2>
            <button class="btn btn-outline p-2" id="modal-close" style="border:none;"><i class='bx bx-x' style="font-size: 1.5rem;"></i></button>
        </div>
        
        <div class="mb-4 p-3" style="background: hsl(var(--color-primary)/0.05); border-radius: 8px; text-align: right;">
            <div style="font-weight: 600;">${record.user_name}</div>
            <div class="text-sm text-muted">${record.course_title}</div>
        </div>

        <form id="edit-progress-form" style="text-align: right;">
            <div class="form-group">
                <label class="form-label">סטטוס למידה</label>
                <select class="form-control" id="edit-status">
                    <option value="not_started" ${dbStatus === 'not_started' ? 'selected' : ''}>טרם הותחל</option>
                    <option value="in_progress" ${dbStatus === 'in_progress' ? 'selected' : ''}>בתהליך</option>
                    <option value="completed" ${dbStatus === 'completed' ? 'selected' : ''}>הושלם</option>
                </select>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label class="form-label">התקדמות (%)</label>
                    <input type="number" class="form-control" id="edit-progress" min="0" max="100" value="${record.progress}">
                </div>
                <div class="form-group">
                    <label class="form-label">ציון</label>
                    <input type="number" class="form-control" id="edit-score" min="0" max="100" value="${scoreVal}" placeholder="אין ציון">
                </div>
            </div>

            <div class="flex flex-col gap-3 mt-6">
                <button type="submit" class="btn btn-primary w-full justify-center">
                    <i class='bx bx-save'></i> שמור שינויים
                </button>
                <div class="flex gap-2">
                    <button type="button" id="modal-delete-btn" class="btn btn-outline w-full justify-center text-danger" style="color: hsl(var(--color-danger)); border-color: hsla(var(--color-danger), 0.2);">
                        <i class='bx bx-trash'></i> מחק רישום
                    </button>
                    <button type="button" id="modal-cancel-btn" class="btn btn-outline w-full justify-center">ביטול</button>
                </div>
            </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        const close = (val = null) => { modal.remove(); resolve(val); };
        
        modal.querySelector('#modal-close').onclick = () => close();
        modal.querySelector('#modal-cancel-btn').onclick = () => close();
        
        modal.querySelector('#modal-delete-btn').onclick = async () => {
            const btn = modal.querySelector('#modal-delete-btn');
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מוחק...`;
            try {
                if (onDelete) await onDelete();
                close('deleted');
            } catch (err) {
                console.error("Delete failed:", err);
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bx-trash'></i> מחק רישום`;
            }
        };

        modal.querySelector('#edit-progress-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = modal.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> שומר...`;
            
            const updates = {
                status: modal.querySelector('#edit-status').value,
                progress: modal.querySelector('#edit-progress').value,
                score: modal.querySelector('#edit-score').value || null
            };
            
            try {
                if (onSave) await onSave(updates);
                close('saved');
            } catch (err) {
                console.error("Save failed:", err);
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bx-save'></i> שמור שינויים`;
            }
        };
    });
}

/**
 * Show a modal for bulk course assignment
 */
export async function showBulkAssignModal({ users, courses, onAssign }) {
    const modal = document.createElement('div');
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 500px; width: 95%; padding: 2rem; border-top: 5px solid hsl(var(--color-primary)); text-align: right;">
        <h2 class="mb-2">הקצאת לומדה לקבוצת עובדים</h2>
        <p class="text-muted mb-4">בחר לומדה להקצאה עבור <strong>${users.length}</strong> המשתמשים שנבחרו.</p>
        
        <form id="bulk-assign-form" style="text-align: right;">
            <div class="form-group">
                <label class="form-label">בחר לומדה מהקטלוג</label>
                <select class="form-control" id="bulk-course-select" required>
                    <option value="">-- בחר לומדה --</option>
                    ${courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('')}
                </select>
            </div>
            
            <div class="flex gap-3 mt-6">
                <button type="submit" class="btn btn-primary w-full justify-center">
                    <i class='bx bx-check-double'></i> בצע הקצאה קבוצתית
                </button>
                <button type="button" id="bulk-cancel-btn" class="btn btn-outline w-full justify-center">ביטול</button>
            </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        const close = () => { modal.remove(); resolve(null); };
        modal.querySelector('#bulk-cancel-btn').onclick = close;
        
        modal.querySelector('#bulk-assign-form').onsubmit = async (e) => {
            e.preventDefault();
            const courseId = modal.querySelector('#bulk-course-select').value;
            const btn = modal.querySelector('button[type="submit"]');
            
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מבצע הקצאה...`;
            
            try {
                if (onAssign) await onAssign(courseId);
                close();
            } catch (err) {
                console.error("Bulk assign failed:", err);
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bx-check-double'></i> בצע הקצאה קבוצתית`;
            }
        };
    });
}

/**
 * Show a modal for bulk organization assignment
 */
export async function showBulkOrgModal({ users, organizations, onAssign }) {
    const modal = document.createElement('div');
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 500px; width: 95%; padding: 2rem; border-top: 5px solid hsl(var(--color-primary)); text-align: right;">
        <h2 class="mb-2">העברת עובדים לארגון אחר</h2>
        <p class="text-muted mb-4">בחר את ארגון היעד עבור <strong>${users.length}</strong> המשתמשים שנבחרו.</p>
        
        <form id="bulk-org-form" style="text-align: right;">
            <div class="form-group">
                <label class="form-label">בחר ארגון יעד</label>
                <select class="form-control" id="bulk-org-select" required>
                    <option value="">-- בחר ארגון --</option>
                    ${organizations.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="flex gap-3 mt-6">
                <button type="submit" class="btn btn-primary w-full justify-center">
                    <i class='bx bx-建物'></i> בצע העברה קבוצתית
                </button>
                <button type="button" id="bulk-org-cancel-btn" class="btn btn-outline w-full justify-center">ביטול</button>
            </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        const close = () => { modal.remove(); resolve(null); };
        modal.querySelector('#bulk-org-cancel-btn').onclick = close;
        
        modal.querySelector('#bulk-org-form').onsubmit = async (e) => {
            e.preventDefault();
            const orgId = modal.querySelector('#bulk-org-select').value;
            const btn = modal.querySelector('button[type="submit"]');
            
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מבצע העברה...`;
            
            try {
                if (onAssign) await onAssign(orgId);
                close();
            } catch (err) {
                console.error("Bulk org assign failed:", err);
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bx-建物'></i> בצע העברה קבוצתית`;
            }
        };
    });
}

/**
 * Show a modal for bulk group assignment
 */
export async function showBulkGroupModal({ users, groups, onAssign }) {
    const modal = document.createElement('div');
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 500px; width: 95%; padding: 2rem; border-top: 5px solid hsl(var(--color-primary)); text-align: right;">
        <h2 class="mb-2">שיוך עובדים לקבוצה</h2>
        <p class="text-muted mb-4">בחר קבוצת יעד עבור <strong>${users.length}</strong> המשתמשים שנבחרו.</p>
        
        <form id="bulk-group-form" style="text-align: right;">
            <div class="form-group">
                <label class="form-label">בחר קבוצה מהרשימה</label>
                <select class="form-control" id="bulk-group-select" required>
                    <option value="">-- בחר קבוצה --</option>
                    ${groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="flex gap-3 mt-6">
                <button type="submit" class="btn btn-primary w-full justify-center">
                    <i class='bx bx-group'></i> הוסף לקבוצה
                </button>
                <button type="button" id="bulk-group-cancel-btn" class="btn btn-outline w-full justify-center">ביטול</button>
            </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        const close = () => { modal.remove(); resolve(null); };
        modal.querySelector('#bulk-group-cancel-btn').onclick = close;
        
        modal.querySelector('#bulk-group-form').onsubmit = async (e) => {
            e.preventDefault();
            const groupId = modal.querySelector('#bulk-group-select').value;
            const btn = modal.querySelector('button[type="submit"]');
            
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מבצע שיוך...`;
            
            try {
                if (onAssign) await onAssign(groupId);
                close();
            } catch (err) {
                console.error("Bulk group assign failed:", err);
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bx-group'></i> הוסף לקבוצה`;
            }
        };
    });
}

/**
 * Show a modal for bulk role assignment
 */
export async function showBulkRoleModal({ users, onAssign }) {
    const modal = document.createElement('div');
    modal.style = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
      display: flex; align-items: center; justify-content: center; 
      z-index: 9999; backdrop-filter: blur(4px); animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="card slide-up" style="max-width: 500px; width: 95%; padding: 2rem; border-top: 5px solid hsl(var(--color-primary)); text-align: right;">
        <h2 class="mb-2">שינוי תפקיד קבוצתי</h2>
        <p class="text-muted mb-4">בחר את התפקיד החדש עבור <strong>${users.length}</strong> המשתמשים שנבחרו.</p>
        
        <form id="bulk-role-form" style="text-align: right;">
            <div class="form-group">
                <label class="form-label">בחר תפקיד במערכת</label>
                <select class="form-control" id="bulk-role-select" required style="height: 48px;">
                    <option value="">-- בחר תפקיד --</option>
                    <option value="learner">לומד (Learner)</option>
                    <option value="org_admin">מנהל הדרכה (Admin)</option>
                </select>
            </div>
            
            <div class="flex gap-3 mt-6">
                <button type="submit" class="btn btn-primary w-full justify-center">
                    <i class='bx bx-user-check'></i> עדכן תפקיד לכולם
                </button>
                <button type="button" id="bulk-role-cancel-btn" class="btn btn-outline w-full justify-center">ביטול</button>
            </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);

    return new Promise((resolve) => {
        const close = () => { modal.remove(); resolve(null); };
        modal.querySelector('#bulk-role-cancel-btn').onclick = close;
        
        modal.querySelector('#bulk-role-form').onsubmit = async (e) => {
            e.preventDefault();
            const role = modal.querySelector('#bulk-role-select').value;
            const btn = modal.querySelector('button[type="submit"]');
            
            btn.disabled = true;
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מעדכן...`;
            
            try {
                if (onAssign) await onAssign(role);
                close();
            } catch (err) {
                console.error("Bulk role assign failed:", err);
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bx-user-check'></i> עדכן תפקיד לכולם`;
            }
        };
    });
}

/**
 * Dynamic Branding: Apply organization primary color to CSS variables
 */
export function applyOrganizationStyles(user) {
    // Force system blue ONLY for real Super Admins (who are NOT impersonating someone else)
    if (!user || (user.role === 'super_admin' && !user.isImpersonating)) {
        // Reset to default LMS blue
        document.documentElement.style.setProperty('--color-primary', '216 100% 50%');
        document.documentElement.style.setProperty('--color-primary-hover', '216 100% 45%');
        return;
    }

    // From here on, either it's a regular user or a Super Admin who IS impersonating someone.
    // We use the orgColor provided (which should now be correctly passed in impersonation mode).
    const orgColor = user.orgColor || user.org_color;

    if (orgColor) {
        const hsl = hexToHslComponents(orgColor);
        document.documentElement.style.setProperty('--color-primary', `${hsl.h} ${hsl.s}% ${hsl.l}%`);
        // Create a hover state by darkening the lightness by 5%
        document.documentElement.style.setProperty('--color-primary-hover', `${hsl.h} ${hsl.s}% ${Math.max(0, hsl.l - 5)}%`);
    } else {
        // Reset to default LMS blue
        document.documentElement.style.setProperty('--color-primary', '216 100% 50%');
        document.documentElement.style.setProperty('--color-primary-hover', '216 100% 45%');
    }
}

/**
 * Convert Hex color string to HSL components
 */
function hexToHslComponents(hex) {
    let r = 0, g = 0, b = 0;
    // Clean the hex string
    hex = hex.replace('#', '');
    
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }
    
    r /= 255; g /= 255; b /= 255;
    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0, s = 0, l = 0;

    if (delta === 0) h = 0;
    else if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    l = (cmax + cmin) / 2;
    s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}
