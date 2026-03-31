import { initRouter } from './src/router.js'
import { checkAuth, onAuthStatusChange } from './src/auth.js'
import { applyOrganizationStyles, showAlert, showConfirmModal, showPrompt } from './src/lib/ui.js'

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

    // Impersonation Banner logic
    if (user?.isImpersonating) {
        const banner = document.createElement('div');
        banner.style = `
            background: #fef3c7; border-bottom: 2px solid #fbbf24; 
            padding: 8px 16px; display: flex; align-items: center; 
            justify-content: center; gap: 12px; font-weight: 500;
            color: #92400e; z-index: 10001; position: sticky; top: 0;
        `;
        banner.innerHTML = `
            <i class='bx bxs-user-voice' style="font-size: 1.25rem;"></i>
            <span>מצב התחזות: הנך צופה במערכת כ-<strong>${user.fullName || user.full_name}</strong> (${user.role === 'org_admin' ? 'מנהל הדרכה' : 'לומד'})</span>
            <button class="btn btn-primary btn-sm" id="stop-impersonation-btn" style="padding: 4px 12px; font-size: 0.85rem; height: auto;">הפסק התחזות וחזור לחשבון שלי</button>
        `;
        document.body.prepend(banner);
        
        banner.querySelector('#stop-impersonation-btn').onclick = async () => {
             const { stopImpersonating } = await import('./src/auth.js');
             await stopImpersonating();
        };
    }

    initRouter(appContainer)

    // Pre-register SCORM Service Worker for faster course loading
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./scorm-sw.js').catch(err => {
        console.error('[InAlign] SW pre-registration failed:', err);
      });
    }
    
  } catch (err) {
    console.error("Initialization Failed", err)
    appContainer.innerHTML = `<div class="container mt-4 text-center"><h2>שגיאה בטעינת המערכת</h2><p>${err.message}</p></div>`
  }
})

/**
 * Global overrides for native browser dialogs (Alert, Confirm, Prompt)
 * These ensures a consistent premium UI across the entire application.
 */
window.alert = (message) => showAlert({ message });
window.confirm = (message) => {
    console.warn("Native confirm() called. Use showConfirmModal() for async support.");
    return showConfirmModal({ title: 'אישור פעולה', message, type: 'info' });
};
window.prompt = (message, defaultValue) => {
    console.warn("Native prompt() called. Use showPrompt() for async support.");
    return showPrompt({ title: 'הזנת נתונים', message, defaultValue });
};
