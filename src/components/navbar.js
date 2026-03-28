import { logout } from '../auth.js'
import { applyOrganizationStyles } from '../lib/ui.js'

export function renderNavbar(user) {
  const nav = document.createElement('nav')
  nav.className = 'navbar'
  
  // Decide links based on role
  let linksStr = ''
  if (user.role === 'super_admin') {
    linksStr += `<a href="#/superadmin/orgs" class="nav-link"><i class='bx bx-building-house'></i> ניהול ארגונים</a>`
    linksStr += `<a href="#/admin/users" class="nav-link"><i class='bx bx-group'></i> ניהול עובדים</a>`
    linksStr += `<a href="#/superadmin/assignments" class="nav-link"><i class='bx bx-link'></i> הקצאת לומדות</a>`
  } else if (user.role === 'admin' || user.role === 'org_admin') {
    linksStr += `<a href="#/admin" class="nav-link"><i class='bx bx-pie-chart-alt'></i> דשבורד מנהל</a>`
    linksStr += `<a href="#/admin/scorm" class="nav-link"><i class='bx bx-upload'></i> ניהול לומדות</a>`
    linksStr += `<a href="#/admin/users" class="nav-link"><i class='bx bx-user'></i> ניהול עובדים</a>`
    linksStr += `<a href="#/learner" class="nav-link"><i class='bx bx-book-open'></i> תצוגת לומד</a>`
  } else {
    linksStr += `<a href="#/learner" class="nav-link"><i class='bx bx-home'></i> האזור האישי שלי</a>`
  }
  
  nav.innerHTML = `
    <div class="container navbar-container">
      <div class="navbar-brand">
        ${user.orgLogo ? `<img src="${user.orgLogo}" alt="${user.orgName}" style="height: 35px; max-width: 180px; object-fit: contain;">` : `<i class='bx bx-hive'></i> <span>LMS Enterprise</span>`}
      </div>
      <div class="navbar-nav">
        ${linksStr}
        <div class="user-menu flex items-center gap-2">
          ${user.originalRole === 'super_admin' ? `<button id="exit-impersonation-btn" class="btn btn-warning text-sm" style="background: hsl(var(--color-warning)); color: black;" title="חזור לניהול הראשי"><i class='bx bx-exit'></i> חזור לניהול הראשי</button>` : ''}
          <div class="text-sm text-muted" style="line-height: 1.2;">
            שלום, ${user.fullName}<br>
            <strong style="color: hsl(var(--color-primary))">(${user.orgName || 'מנהל ראשי'})</strong>
          </div>
          <button id="logout-btn" class="btn btn-outline text-sm" title="התנתק"><i class='bx bx-log-out'></i></button>
        </div>
      </div>
    </div>
  `

  setTimeout(() => {
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    if (user.originalRole === 'super_admin') {
      document.getElementById('exit-impersonation-btn').addEventListener('click', () => {
        window.__APP_STATE.user.role = 'super_admin';
        window.__APP_STATE.user.originalRole = null;
        window.__APP_STATE.user.orgId = window.__APP_STATE.user.originalOrgId || null;
        window.__APP_STATE.user.orgName = 'ניהול ראשי';
        applyOrganizationStyles(window.__APP_STATE.user);
        window.location.hash = '#/superadmin/orgs';
      });
    }
  }, 0)

  return nav
}
