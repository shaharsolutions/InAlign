import { getCurrentUserSync as getUser } from './auth.js'
import renderLogin from './pages/login.js'
import renderAdminDashboard from './pages/admin.js'
import renderAdminScorm from './pages/admin-scorm.js'
import renderAdminAssignments from './pages/admin-assignments.js'
import renderAdminUsers from './pages/admin-users.js'
import renderLearnerDashboard from './pages/learner.js'
import renderPlayer from './pages/player.js'
import renderSuperAdminOrgs from './pages/superadmin-orgs.js'
import { renderNavbar } from './components/navbar.js'

export function initRouter(container) {
  // Listen to hash changes
  window.addEventListener('hashchange', () => navigate(container))
  // Initial navigate
  navigate(container)
}

function navigate(container) {
  const hash = window.location.hash || '#/'
  const user = getUser()

  // Guard: if no user to login
  if (!user && hash !== '#/login') {
    window.location.hash = '#/login'
    return
  }

  // Clear container
  container.innerHTML = ''
  container.className = 'app-container fade-in'

  // Render Navbar if user is logged in
  if (user) {
    const nav = renderNavbar(user)
    container.appendChild(nav)
  }

  // Main content wrapper
  const pageContainer = document.createElement('main')
  pageContainer.className = 'container mt-4 mb-4 slide-up w-full'
  container.appendChild(pageContainer)

  // Route mapping
  if (hash === '#/login') {
    // If user is already logged in, redirect based on role
    if (user) {
      if (user.role === 'super_admin') window.location.hash = '#/superadmin/orgs'
      else if (user.role === 'org_admin' || user.role === 'admin') window.location.hash = '#/admin'
      else window.location.hash = '#/learner'
      return
    }
    renderLogin(pageContainer)
  } else if (hash === '#/admin') {
    // Admin Guard
    if (user.role !== 'admin' && user.role !== 'org_admin') {
      window.location.hash = '#/'
      return
    }
    renderAdminDashboard(pageContainer)
  } else if (hash === '#/admin/scorm') {
    // Admin SCORM Guard
    if (user.role !== 'admin' && user.role !== 'org_admin') {
      window.location.hash = '#/'
      return
    }
    renderAdminScorm(pageContainer)
  } else if (hash === '#/admin/users') {
    // Admin Users Guard
    if (user.role !== 'admin' && user.role !== 'org_admin') {
      window.location.hash = '#/'
      return
    }
    renderAdminUsers(pageContainer)
  } else if (hash === '#/admin/assignments') {
    // Admin Assignments Guard
    if (user.role !== 'admin' && user.role !== 'org_admin') {
      window.location.hash = '#/'
      return
    }
    renderAdminAssignments(pageContainer)
  } else if (hash === '#/superadmin/orgs') {
    // Super Admin Guard
    if (user.role !== 'super_admin') {
      window.location.hash = '#/'
      return
    }
    renderSuperAdminOrgs(pageContainer)
  } else if (hash === '#/' || hash === '#/learner') {
    // Both can see learner (Admin maybe as demo)
    renderLearnerDashboard(pageContainer)
  } else if (hash.startsWith('#/player')) {
    // Player Page
    renderPlayer(pageContainer)
  } else {
    pageContainer.innerHTML = '<h2>עמוד לא נמצא (404)</h2>'
  }
}
