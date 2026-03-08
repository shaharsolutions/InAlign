import { logout } from '../auth.js'

export function renderNavbar(user) {
  const nav = document.createElement('nav')
  nav.className = 'navbar'
  
  // Decide links based on role
  let linksStr = ''
  if (user.role === 'super_admin') {
    linksStr += `<a href="#/superadmin/orgs" class="nav-link"><i class='bx bx-building-house'></i> ניהול סביבות וארגונים</a>`
  } else if (user.role === 'admin' || user.role === 'org_admin') {
    linksStr += `<a href="#/admin" class="nav-link"><i class='bx bx-pie-chart-alt'></i> דשבורד מנהל</a>`
    linksStr += `<a href="#/admin/scorm" class="nav-link"><i class='bx bx-upload'></i> ניהול לומדות</a>`
    linksStr += `<a href="#/admin/users" class="nav-link"><i class='bx bx-user'></i> ניהול עובדים</a>`
    linksStr += `<a href="#/admin/assignments" class="nav-link"><i class='bx bx-group'></i> הקצאת עובדים</a>`
    linksStr += `<a href="#/learner" class="nav-link"><i class='bx bx-book-open'></i> תצוגת לומד</a>`
  } else {
    linksStr += `<a href="#/learner" class="nav-link"><i class='bx bx-home'></i> האזור האישי שלי</a>`
  }
  
  nav.innerHTML = `
    <div class="container navbar-container">
      <div class="navbar-brand">
        <i class='bx bx-hive'></i>
        <span>LMS Enterprise</span>
      </div>
      <div class="navbar-nav">
        ${linksStr}
        <div class="user-menu flex items-center gap-2">
          <span class="text-sm text-muted">שלום, ${user.fullName} <strong style="color: hsl(var(--color-primary))">(${user.orgName || 'מנהל ראשי'})</strong></span>
          <button id="logout-btn" class="btn btn-outline text-sm" title="התנתק"><i class='bx bx-log-out'></i></button>
        </div>
      </div>
    </div>
  `

  setTimeout(() => {
    document.getElementById('logout-btn').addEventListener('click', logout)
  }, 0)

  return nav
}
