import { 
    fetchGroups, createGroup, deleteGroup, assignCourseToGroup, 
    fetchGroupMembers, assignUsersToGroup, removeUserFromGroup,
    fetchGroupCourses, unassignCourseFromGroup, updateGroup 
} from '../api/groupsApi.js'
import { fetchCourses } from '../api/coursesApi.js'
import { fetchUsers } from '../api/usersApi.js'
import { showConfirmModal, showToast, showCustomModal } from '../lib/ui.js'

export default async function renderAdminGroups(container) {
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">ניהול קבוצות למידה</h1>
      <p class="text-muted">יצירת קבוצות, שיוך עובדים והקצאת לומדות לפי מחלקות או תפקידים.</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 2rem; align-items: start;">
       <!-- Add Group Form Section -->
       <div class="card" style="grid-column: span 1;">
         <h3 class="mb-3">יצירת קבוצה חדשה</h3>
         <form id="group-create-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="group-name">שם הקבוצה <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="group-name" required placeholder="לדוגמה: מחלקת שיווק">
            </div>
            
            <button id="group-submit-btn" type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-plus-circle'></i> צור קבוצה
            </button>
         </form>
       </div>

       <!-- Groups Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <h3 class="mb-3">רשימת הקבוצות בארגון</h3>
         <table class="table" id="groups-table">
            <thead>
               <tr>
                  <th>שם הקבוצה</th>
                  <th>עובדים</th>
                  <th>לומדות</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="4" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען קבוצות...</td></tr>
            </tbody>
         </table>
       </div>
    </div>

    <!-- Group Dashboard (Hidden until group clicked) -->
    <div id="group-detail-view" class="card mt-6 slide-up hidden" style="border-top: 5px solid hsl(var(--color-primary));">
        <div class="flex justify-between items-center mb-6">
            <div>
            <div class="flex items-center gap-2">
                <h2 id="detail-group-name" class="m-0">שם הקבוצה</h2>
                <button class="btn btn-ghost p-1 edit-detail-name-btn" title="ערוך שם קבוצה"><i class='bx bx-edit-alt'></i></button>
            </div>
            <p class="text-muted m-0">ניהול עובדים ולומדות עבור קבוצה זו</p>
            </div>
            <button class="btn btn-outline" id="close-detail-btn"><i class='bx bx-x'></i> סגור</button>
        </div>

        <div class="grid grid-cols-2 gap-6">
            <!-- Members Section -->
            <div class="card" style="background: hsl(var(--color-primary)/0.02); border: 1px solid hsla(var(--text-main), 0.05);">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="m-0"><i class='bx bx-group'></i> עובדים בקבוצה</h4>
                    <button class="btn btn-outline text-xs" id="add-member-btn"><i class='bx bx-user-plus'></i> הוסף עובד</button>
                </div>
                <ul id="member-list" class="list-none p-0 m-0" style="max-height: 250px; overflow-y: auto;">
                    <li class="p-2 border-b text-muted text-sm" style="text-align: center;">טוען עובדים...</li>
                </ul>
            </div>

            <!-- Courses Section -->
            <div class="card" style="background: hsl(var(--color-primary)/0.02); border: 1px solid hsla(var(--text-main), 0.05);">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="m-0"><i class='bx bx-book-open'></i> לומדות שהוקצו</h4>
                    <button class="btn btn-primary text-xs" id="assign-course-btn"><i class='bx bx-plus'></i> הקצה לומדה</button>
                </div>
                 <ul id="group-courses-list" class="list-none p-0 m-0" style="max-height: 250px; overflow-y: auto;">
                    <li class="p-2 border-b text-muted text-sm" style="text-align: center;">טוען לומדות...</li>
                 </ul>
            </div>
        </div>
    </div>
  `

  const tableBody = container.querySelector('#groups-table tbody')
  const form = container.querySelector('#group-create-form')
  const detailView = container.querySelector('#group-detail-view')
  let currentGroup = null;

  async function renderTable() {
    try {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען...</td></tr>`
      const groups = await fetchGroups()
      if (groups.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;" class="text-muted">אין קבוצות בארגון</td></tr>`
        return
      }

      tableBody.innerHTML = groups.map(g => `
        <tr data-id="${g.id}">
           <td><div style="font-weight: 600; cursor:pointer;" class="group-select-link">${g.name}</div></td>
           <td><span class="badge badge-success">${g.user_count || 0} חברים</span></td>
           <td><span class="badge badge-primary">${g.course_count || 0} לומדות</span></td>
           <td>
              <div class="flex gap-2">
                <button class="btn btn-outline text-sm select-group-btn" data-id="${g.id}" data-name="${g.name}" title="נהל קבוצה"><i class='bx bx-cog'></i></button>
                <button class="btn btn-outline text-sm edit-group-btn" data-id="${g.id}" data-name="${g.name}" title="ערוך שם"><i class='bx bx-edit-alt'></i></button>
                <button class="btn btn-outline text-sm text-danger delete-group-btn" data-id="${g.id}" data-name="${g.name}" title="מחיקה"><i class='bx bx-trash'></i></button>
              </div>
           </td>
        </tr>
      `).join('')
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="4" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה: ${err.message}</td></tr>`
    }
  }

  async function showGroupDetail(groupId, groupName) {
    currentGroup = { id: groupId, name: groupName };
    detailView.classList.remove('hidden');
    
    // Ensure header structure is correct (in case it was replaced by an input)
    const headerTitle = container.querySelector('#detail-group-name');
    if (headerTitle) {
        headerTitle.innerText = groupName;
    } else {
        // Fallback or restore structure if innerHTML was manipulated
        const headerContainer = detailView.querySelector('.flex.justify-between.items-center.mb-6 > div');
        headerContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <h2 id="detail-group-name" class="m-0">${groupName}</h2>
                <button class="btn btn-ghost p-1 edit-detail-name-btn" title="ערוך שם קבוצה"><i class='bx bx-edit-alt'></i></button>
            </div>
            <p class="text-muted m-0">ניהול עובדים ולומדות עבור קבוצה זו</p>
        `;
        // Re-attach listener
        headerContainer.querySelector('.edit-detail-name-btn').onclick = attachEditHeaderListener;
    }
    
    // Load members
    const memberList = container.querySelector('#member-list');
    memberList.innerHTML = `<li class="p-2 border-b text-muted text-sm" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען...</li>`;
    
    // Load courses
    const coursesList = container.querySelector('#group-courses-list');
    coursesList.innerHTML = `<li class="p-2 border-b text-muted text-sm" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען...</li>`;

    try {
        const [members, courses] = await Promise.all([
            fetchGroupMembers(groupId),
            fetchGroupCourses(groupId)
        ]);

        // Render Members
        if (members.length === 0) {
            memberList.innerHTML = `<li class="p-4 text-center text-muted text-sm">אין עובדים בקבוצה זו עדיין</li>`;
        } else {
            memberList.innerHTML = members.map(m => `
                <li class="p-3 border-b flex justify-between items-center slide-up" style="border-color: hsla(var(--text-main), 0.05);">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 700; color: hsla(var(--text-main), 0.9); font-size: 0.9rem;">${m.full_name}</span>
                        <span style="font-size: 0.75rem; color: hsla(var(--text-main), 0.5);">${m.email}</span>
                    </div>
                    <button class="btn p-1 text-danger remove-member-btn" data-uid="${m.id}" title="הסר מהקבוצה"><i class='bx bx-user-minus'></i></button>
                </li>
            `).join('');
        }

        // Render Courses
        if (courses.length === 0) {
            coursesList.innerHTML = `<li class="p-4 text-center text-muted text-sm">לא הוקצו לומדות לקבוצה זו</li>`;
        } else {
            coursesList.innerHTML = courses.map(c => `
                <li class="p-3 border-b flex justify-between items-center slide-up" style="border-color: hsla(var(--text-main), 0.05);">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-weight: 700; color: hsla(var(--text-main), 0.9); font-size: 0.9rem;">${c.title}</span>
                        <div>
                            <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; background: hsla(var(--color-primary), 0.1); color: hsl(var(--color-primary)); font-weight: 600;">
                                ${c.category || 'כללי'}
                            </span>
                        </div>
                    </div>
                    <button class="btn p-1 text-danger remove-course-btn" data-cid="${c.id}" title="בטל הקצאה"><i class='bx bx-unlink'></i></button>
                </li>
            `).join('');
        }
    } catch (err) {
        memberList.innerHTML = `<li class="p-4 text-center text-danger text-sm">שגיאה בטעינה</li>`;
        coursesList.innerHTML = `<li class="p-4 text-center text-danger text-sm">שגיאה בטעינה</li>`;
    }
    detailView.scrollIntoView({ behavior: 'smooth' });
  }

  // === Event Listeners ===

  tableBody.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if(!row) return;

    const selectBtn = e.target.closest('.select-group-btn') || e.target.closest('.group-select-link');
    const deleteBtn = e.target.closest('.delete-group-btn');

    if(selectBtn) {
        const gid = row.dataset.id;
        const gname = row.querySelector('.group-select-link').innerText;
        await showGroupDetail(gid, gname);
    }

    if(deleteBtn) {
        const gid = deleteBtn.dataset.id;
        const gname = deleteBtn.dataset.name;
        await showConfirmModal({
            title: 'מחיקת קבוצה',
            message: `האם אתה בטוח שברצונך למחוק את הקבוצה '<strong>${gname}</strong>'? פעולה זו לא תמחק את העובדים עצמם.`,
            onConfirm: async () => {
                await deleteGroup(gid);
                showToast('הקבוצה נמחקה בהצלחה');
                renderTable();
                if(currentGroup?.id === gid) detailView.classList.add('hidden');
            }
        });
    }

    const editBtn = e.target.closest('.edit-group-btn');
    if(editBtn) {
        const gid = editBtn.dataset.id;
        const gname = editBtn.dataset.name;
        const nameCell = row.querySelector('td:first-child');
        const originalContent = nameCell.innerHTML;
        
        nameCell.innerHTML = `
            <div class="flex gap-2 items-center">
                <input type="text" class="form-control text-sm" value="${gname}" id="edit-group-input-${gid}" style="min-width: 150px;">
                <button class="btn btn-primary p-1 save-group-name" data-id="${gid}"><i class='bx bx-check'></i></button>
                <button class="btn btn-outline p-1 cancel-group-rename"><i class='bx bx-x'></i></button>
            </div>
        `;
        
        const input = nameCell.querySelector('input');
        input.focus();
        input.select();

        nameCell.querySelector('.cancel-group-rename').onclick = (ev) => {
            ev.stopPropagation();
            nameCell.innerHTML = originalContent;
        };

        nameCell.querySelector('.save-group-name').onclick = async (ev) => {
            ev.stopPropagation();
            const newName = input.value.trim();
            if(!newName || newName === gname) {
                nameCell.innerHTML = originalContent;
                return;
            }

            try {
                nameCell.innerHTML = `<i class='bx bx-loader bx-spin'></i> מעדכן...`;
                await updateGroup(gid, newName);
                showToast('שם הקבוצה עודכן בהצלחה');
                renderTable();
            } catch (err) {
                showToast(err.message, 'error');
                nameCell.innerHTML = originalContent;
            }
        };

        input.onkeydown = (ev) => {
            if(ev.key === 'Enter') nameCell.querySelector('.save-group-name').click();
            if(ev.key === 'Escape') nameCell.querySelector('.cancel-group-rename').click();
        };
    }
  });

  container.querySelector('#close-detail-btn').onclick = () => detailView.classList.add('hidden');

  function attachEditHeaderListener() {
    if(!currentGroup) return;
    const headerTitleScope = container.querySelector('#detail-group-name');
    if (!headerTitleScope) return;
    
    const headerDiv = headerTitleScope.parentElement;
    const originalHTML = headerDiv.parentElement.innerHTML; // Save the whole outer div content
    
    headerDiv.innerHTML = `
        <div class="flex gap-2 items-center">
            <input type="text" class="form-control" value="${currentGroup.name}" id="edit-detail-input">
            <button class="btn btn-primary p-1 save-detail-name"><i class='bx bx-check'></i></button>
            <button class="btn btn-outline p-1 cancel-detail-rename"><i class='bx bx-x'></i></button>
        </div>
    `;

    const input = headerDiv.querySelector('input');
    input.focus();
    input.select();

    headerDiv.querySelector('.cancel-detail-rename').onclick = () => {
        showGroupDetail(currentGroup.id, currentGroup.name);
    };

    headerDiv.querySelector('.save-detail-name').onclick = async () => {
        const newName = input.value.trim();
        if(!newName || newName === currentGroup.name) {
            showGroupDetail(currentGroup.id, currentGroup.name);
            return;
        }

        try {
            await updateGroup(currentGroup.id, newName);
            showToast('שם הקבוצה עודכן בהצלחה');
            currentGroup.name = newName;
            renderTable();
            showGroupDetail(currentGroup.id, newName);
        } catch (err) {
            showToast(err.message, 'error');
            showGroupDetail(currentGroup.id, currentGroup.name);
        }
    };

    input.onkeydown = (ev) => {
        if(ev.key === 'Enter') headerDiv.querySelector('.save-detail-name').click();
        if(ev.key === 'Escape') headerDiv.querySelector('.cancel-detail-rename').click();
    };
  }

  // Initial attachment
  const editDetailBtn = container.querySelector('.edit-detail-name-btn');
  if (editDetailBtn) editDetailBtn.onclick = attachEditHeaderListener;

  container.querySelector('#add-member-btn').onclick = async () => {
    if(!currentGroup) return;
    try {
        const allUsers = await fetchUsers();
        
        showCustomModal({
            title: 'הוספת עובד לקבוצה',
            content: `
                <div class="form-group">
                    <label class="form-label">בחר עובד מהרשימה</label>
                    <select class="form-control" id="member-to-add">
                        <option value="">-- בחר --</option>
                        ${allUsers.map(u => `<option value="${u.id}">${u.full_name}</option>`).join('')}
                    </select>
                </div>
            `,
            footer: `
                <button class="btn btn-primary w-full" id="confirm-add-btn">הוסף</button>
                <button class="btn btn-outline w-full" data-close>ביטול</button>
            `
        });

        const confirmBtn = document.getElementById('confirm-add-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const uid = document.getElementById('member-to-add').value;
                if(!uid) return;
                
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מוסיף...`;
                
                try {
                    await assignUsersToGroup(currentGroup.id, [uid]);
                    showToast('העובד התווסף בהצלחה');
                    document.querySelector('.modal-overlay')?.remove();
                    showGroupDetail(currentGroup.id, currentGroup.name);
                    renderTable();
                } catch (err) {
                    showToast(err.message, 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = `הוסף`;
                }
            };
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
  };

  // Remove member
  container.querySelector('#member-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-member-btn');
    if(!btn) return;
    const uid = btn.dataset.uid;
    const userName = btn.closest('li').querySelector('.font-bold')?.innerText || 'העובד';

    await showConfirmModal({
        title: 'הסרת עובד מקבוצה',
        message: `האם אתה בטוח שברצונך להסיר את <strong>${userName}</strong> מהקבוצה <strong>${currentGroup.name}</strong>?`,
        confirmText: 'הסר',
        onConfirm: async () => {
            await removeUserFromGroup(currentGroup.id, uid);
            showToast('העובד הוסר מהקבוצה');
            showGroupDetail(currentGroup.id, currentGroup.name);
            renderTable();
        }
    });
  });

  container.querySelector('#assign-course-btn').onclick = async () => {
    if(!currentGroup) return;
    try {
        const courses = await fetchCourses();
        
        showCustomModal({
            title: 'הקצאת לומדה לקבוצה',
            content: `
                <p class="text-sm text-muted mb-4">הלומדה תוקצה לכל חברי '<strong>${currentGroup.name}</strong>'</p>
                <div class="form-group">
                    <select class="form-control" id="course-to-assign">
                        <option value="">-- בחר לומדה --</option>
                        ${courses.map(c => `<option value="${c.id}">${c.title}</option>`).join('')}
                    </select>
                </div>
            `,
            footer: `
                <button class="btn btn-primary w-full" id="confirm-assign-btn">הקצה עכשיו</button>
                <button class="btn btn-outline w-full" data-close>ביטול</button>
            `
        });

        const confirmBtn = document.getElementById('confirm-assign-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const cid = document.getElementById('course-to-assign').value;
                if(!cid) return;

                confirmBtn.disabled = true;
                confirmBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מקצה...`;

                try {
                    await assignCourseToGroup(currentGroup.id, cid);
                    showToast('הלומדה הוקצתה לקבוצה');
                    document.querySelector('.modal-overlay')?.remove();
                    showGroupDetail(currentGroup.id, currentGroup.name);
                    renderTable();
                } catch (err) {
                    showToast(err.message, 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = `הקצה עכשיו`;
                }
            };
        }
    } catch(err) {
        showToast(err.message, 'error');
    }
  };

  // Remove Course from Group
  container.querySelector('#group-courses-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-course-btn');
    if(!btn) return;
    const cid = btn.dataset.cid;
    const courseTitle = btn.closest('li').querySelector('.font-bold')?.innerText || 'הלומדה';

    await showConfirmModal({
        title: 'ביטול הקצאת לומדה',
        message: `האם אתה בטוח שברצונך לבטל את הקצאת הלומדה <strong>${courseTitle}</strong> מהקבוצה <strong>${currentGroup.name}</strong>?`,
        confirmText: 'בטל הקצאה',
        onConfirm: async () => {
            await unassignCourseFromGroup(currentGroup.id, cid);
            showToast('ההקצאה בוטלה בהצלחה');
            showGroupDetail(currentGroup.id, currentGroup.name);
            renderTable();
        }
    });
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = container.querySelector('#group-name').value;
    const btn = container.querySelector('#group-submit-btn');
    btn.disabled = true;
    try {
        await createGroup(name);
        showToast('הקבוצה נוצרה בהצלחה');
        form.reset();
        renderTable();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
  };

  await renderTable()
}
