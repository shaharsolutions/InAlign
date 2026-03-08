import { fetchUsers, createUser, deleteUser } from '../api/usersApi.js'

export default async function renderAdminUsers(container) {
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-1">ניהול עובדי הארגון</h1>
      <p class="text-muted">הוספה, אימות ומחיקה של משתמשים המורשים להיכנס למערכת בסביבה שלך.</p>
    </div>

    <div class="grid grid-cols-3 slide-up" style="gap: 1.5rem; align-items: start;">
       <!-- Add User Form Section -->
       <div class="card" style="grid-column: span 1;">
         <h3 class="mb-3">יצירת משתמש חדש</h3>
         <form id="user-create-form">
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="user-name">שם מלא <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="text" id="user-name" required placeholder="לדוגמה: משה כהן">
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="user-email">כתובת אימייל <span style="color: hsl(var(--color-danger));">*</span></label>
               <input class="form-control" type="email" id="user-email" required placeholder="moshe@company.com">
            </div>
            <div class="form-group" style="text-align: right;">
               <label class="form-label" for="user-role">תפקיד במערכת</label>
               <select class="form-control" id="user-role">
                  <option value="learner">לומד (Learner)</option>
                  <option value="org_admin">מנהל הדרכה (Admin)</option>
               </select>
            </div>
            
            <button type="submit" class="btn btn-primary w-full justify-center mt-4">
              <i class='bx bx-user-plus'></i> צור חשבון ושגר הזמנה
            </button>
            <div id="user-msg" style="margin-top: 10px; text-align: center; font-weight: 500; min-height: 20px;" class="text-sm"></div>
         </form>
       </div>

       <!-- Table Section -->
       <div class="card table-wrapper" style="grid-column: span 2;">
         <h3 class="mb-3">רשימת משתמשים פעילים</h3>
         <table class="table" id="users-table">
            <thead>
               <tr>
                  <th>שם מלא</th>
                  <th>אימייל / הרשאה</th>
                  <th>סטטוס</th>
                  <th>תאריך הצטרפות</th>
                  <th>פעולות</th>
               </tr>
            </thead>
            <tbody>
               <tr><td colspan="5" style="text-align: center;"><i class='bx bx-loader bx-spin'></i> טוען משתמשים...</td></tr>
            </tbody>
         </table>
       </div>
    </div>
  `

  const tableBody = container.querySelector('#users-table tbody')

  async function renderTable() {
    try {
      const users = await fetchUsers()
      if (users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">אין משתמשים במערכת</td></tr>`
        return
      }

      tableBody.innerHTML = users.map(u => `
        <tr>
           <td>
              <div style="font-weight: 500;">${u.full_name}</div>
           </td>
           <td>
              ${u.email || '-'} <br>
              <span class="text-xs text-muted">${u.role === 'org_admin' ? 'מנהל מערכת' : 'לומד קצה'}</span>
           </td>
           <td><span class="badge ${u.status === 'פעיל' ? 'badge-success' : 'badge-warning'}">${u.status || 'פעיל'}</span></td>
           <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : '-'}</td>
           <td>
             <div class="flex gap-2">
               <button class="btn btn-outline text-sm edit-btn" title="עריכת משתמש"><i class='bx bx-edit'></i></button>
               <button class="btn btn-outline text-sm delete-btn" data-id="${u.id}" title="מחיקת חשבון"><i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i></button>
             </div>
           </td>
        </tr>
      `).join('')

      // Setup edit buttons
      container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const msg = document.getElementById('user-msg');
          msg.innerHTML = 'עריכת משתמש קיימת תעודכן במערך הבא';
          msg.style.color = 'hsl(var(--color-primary))';
          setTimeout(() => { msg.innerHTML = ''; }, 3000);
        });
      });

      // Setup delete buttons with double-click confirm
      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const buttonElement = e.currentTarget;
          const msg = document.getElementById('user-msg');

          if (buttonElement.classList.contains('confirming')) {
            buttonElement.innerHTML = `<i class='bx bx-loader bx-spin'></i>`;
            try {
              await deleteUser(id);
              msg.style.color = 'hsl(var(--color-success))';
              msg.innerHTML = 'החשבון נמחק בהצלחה וינותק מהמערכת.';
              setTimeout(() => msg.innerHTML='', 3000);
              renderTable();
            } catch (err) {
              msg.style.color = 'hsl(var(--color-danger))';
              msg.innerHTML = err.message;
              setTimeout(() => msg.innerHTML='', 4000);
              renderTable();
            }
          } else {
            buttonElement.classList.add('confirming');
            buttonElement.innerHTML = `אישור מחיקה \u26A0`;
            buttonElement.classList.remove('btn-outline');
            buttonElement.classList.add('btn-danger');

            setTimeout(() => {
                if (document.body.contains(buttonElement)) {
                    buttonElement.classList.remove('confirming');
                    buttonElement.innerHTML = `<i class='bx bx-trash' style="color: hsl(var(--color-danger));"></i>`;
                    buttonElement.classList.add('btn-outline');
                    buttonElement.classList.remove('btn-danger');
                }
            }, 3000);
          }
        })
      })
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" style="color: hsl(var(--color-danger)); text-align: center;">שגיאה: ${err.message}</td></tr>`
    }
  }

  await renderTable()

  // Handle Create User
  const form = container.querySelector('#user-create-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const msg = document.getElementById('user-msg')
    const submitBtn = form.querySelector('button[type="submit"]')
    
    // Values
    const userData = {
      fullName: document.getElementById('user-name').value,
      email: document.getElementById('user-email').value,
      role: document.getElementById('user-role').value
    }

    submitBtn.disabled = true
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> מזהה בשרת...`
    
    try {
      await createUser(userData);
      await renderTable();
      form.reset();
      msg.style.color = 'hsl(var(--color-success))';
      msg.innerHTML = 'המשתמש הוקם. מייל איפוס סיסמה נשלח!';
    } catch (err) {
      msg.style.color = 'hsl(var(--color-danger))';
      msg.innerHTML = 'שגיאה: ' + err.message;
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = `<i class='bx bx-user-plus'></i> צור חשבון ושגר הזמנה`
      setTimeout(() => { msg.innerHTML = '' }, 4000)
    }
  })
}
