import { getCurrentUserSync as getUser } from './auth.js'
import { renderNavbar } from './components/navbar.js'
import { getRoute } from './routes.js'

export function initRouter(container) {
  // Listen to hash changes
  window.addEventListener('hashchange', () => navigate(container))
  // Initial navigate
  navigate(container)
}

async function navigate(container) {
  const hash = window.location.hash || '#/'
  const user = getUser()
  const route = getRoute(hash)

  // 1. Guard: Authentication
  if (!user && hash !== '#/login') {
    window.location.hash = '#/login'
    return
  }

  // 2. Guard: Authorization (Roles)
  if (route && route.roles) {
    if (!route.roles.includes(user.role)) {
      console.warn(`Access Denied to ${hash} for role ${user.role}`)
      window.location.hash = '#/'
      return
    }
  }

  // 3. Special Case: Already logged in user trying to access Login page
  if (user && hash === '#/login') {
    if (user.role === 'super_admin') window.location.hash = '#/superadmin/orgs'
    else if (user.role === 'org_admin' || user.role === 'admin') window.location.hash = '#/admin'
    else window.location.hash = '#/learner'
    return
  }

  // 4. Handle 404
  if (!route) {
    container.innerHTML = '<div class="container mt-4 text-center"><h2>עמוד לא נמצא (404)</h2><a href="#/" class="btn btn-primary mt-2">חזרה לבית</a></div>'
    return
  }

  // 5. Clear container and setup layout
  container.innerHTML = ''
  container.className = 'app-container fade-in'

  // 6. Layout Management
  let pageContainer = container;
  if (route.layout === 'default') {
      // Navbar + Main Container
      const nav = renderNavbar(user)
      container.appendChild(nav)

      const main = document.createElement('main')
      main.className = 'container mt-4 mb-4 slide-up w-full'
      container.appendChild(main)
      pageContainer = main;
  }

  // 7. Render Route Component
  try {
    await route.component(pageContainer)
  } catch (err) {
    console.error(`Error rendering route ${hash}:`, err)
    pageContainer.innerHTML = `<div class="p-8 text-center text-danger"><h3>שגיאה בטעינת העמוד</h3><p>${err.message}</p></div>`
  }
}
