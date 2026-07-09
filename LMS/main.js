import { initRouter } from './src/router.js'
import { checkAuth, onAuthStatusChange, stopImpersonating } from './src/auth.js'
import { escapeHtml } from './src/lib/html.js'
import { supabase } from './src/lib/supabase.js'
import { applyOrganizationStyles, showAlert, showConfirmModal, showPrompt } from './src/lib/ui.js'
import { roleLabel } from './src/lib/roles.js'

function primeScormWorker(user) {
  if (!('serviceWorker' in navigator)) return

  // Do this in the background while the application renders. The player can
  // then use an active, authenticated worker immediately instead of creating
  // it after the learner presses "start".
  navigator.serviceWorker.register('./scorm-sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(async (registration) => {
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      const worker = navigator.serviceWorker.controller || registration.active
      if (worker && session?.access_token) {
        worker.postMessage({ type: 'SET_AUTH_TOKEN', token: session.access_token, userId: user?.id })
      }
    })
    .catch(err => console.error('[Align] SCORM worker pre-registration failed:', err))
}

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
        banner.id = 'impersonation-banner';
        banner.style = `
            background: #fef3c7; border-bottom: 2px solid #fbbf24; 
            padding: 8px 16px; display: flex; align-items: center; 
            justify-content: center; gap: 12px; font-weight: 500;
            color: #92400e; z-index: 10001; position: sticky; top: 0;
        `;
        banner.innerHTML = `
            <i class='bx bxs-user-voice' style="font-size: 1.25rem;"></i>
            <span>מצב התחזות: הנך צופה במערכת כ-<strong>${escapeHtml(user.fullName || user.full_name)}</strong> (${roleLabel(user.role)})</span>
            <button class="btn btn-primary btn-sm" id="stop-impersonation-btn" style="padding: 4px 12px; font-size: 0.85rem; height: auto;">הפסק התחזות וחזור לחשבון שלי</button>
        `;
        document.body.prepend(banner);
        
        banner.querySelector('#stop-impersonation-btn').onclick = async () => {
             await stopImpersonating();
        };
    }

    initRouter(appContainer)

    primeScormWorker(user)
    
  } catch (err) {
    console.error("Initialization Failed", err)
    appContainer.innerHTML = `<div class="container mt-4 text-center"><h2>שגיאה בטעינת המערכת</h2><p>${escapeHtml(err.message)}</p></div>`
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
