import { initRouter } from './src/router.js'
import { checkAuth, onAuthStatusChange } from './src/auth.js'
import { applyOrganizationStyles } from './src/lib/ui.js'

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app')
  
  // App initialization flow
  try {
    const user = await checkAuth()
    
    // Set global data and apply branding
    window.__APP_STATE = { user }
    applyOrganizationStyles(user)
    
    // Listen for session invalidations
    onAuthStatusChange((event) => {
      if (event === 'SIGNED_OUT') applyOrganizationStyles(null);
    });

    initRouter(appContainer)
    
  } catch (err) {
    console.error("Initialization Failed", err)
    appContainer.innerHTML = `<div class="container mt-4 text-center"><h2>שגיאה בטעינת המערכת</h2><p>${err.message}</p></div>`
  }
})
