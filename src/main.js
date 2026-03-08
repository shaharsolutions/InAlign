import { initRouter } from './router.js'
import { checkAuth } from './auth.js'

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app')
  
  // App initialization flow
  try {
    const user = await checkAuth()
    
    // Set global data and init router
    window.__APP_STATE = { user }
    initRouter(appContainer)
    
  } catch (err) {
    console.error("Initialization Failed", err)
    appContainer.innerHTML = `<div class="container mt-4 text-center"><h2>שגיאה בטעינת המערכת</h2><p>${err.message}</p></div>`
  }
})
