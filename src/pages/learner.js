import { getCurrentUserSync } from '../api/authApi.js'
import { fetchLearnerAssignments } from '../api/progressApi.js'
import { fetchOrganizationById } from '../api/orgApi.js'

export default async function renderLearnerDashboard(container) {
  const user = getCurrentUserSync()
  
  container.innerHTML = `
    <div class="mb-4 fade-in">
      <h1 class="mb-2">לוח למידה אישי</h1>
      <p class="text-muted">עקוב אחר ההתקדמות שלך והקפד להשלים משימות בזמן</p>
    </div>

    <div id="welcome-message-container"></div>
    
    <div class="stats grid grid-cols-3 mb-4 slide-up" style="gap: var(--gap-standard);">
      <div class="card flex items-center justify-between">
         <div>
            <h4 class="mb-1 text-muted">לומדות חובה לביצוע</h4>
            <div id="stat-pending" style="font-size: 1.5rem; font-weight: 700;">--</div>
         </div>
         <i class='bx bx-task' style="font-size: 2.5rem; color: hsl(var(--color-warning));"></i>
      </div>
      <div class="card flex items-center justify-between">
         <div>
            <h4 class="mb-1 text-muted">בתהליך למידה</h4>
            <div id="stat-progress" style="font-size: 1.5rem; font-weight: 700;">--</div>
         </div>
         <i class='bx bx-loader-circle' style="font-size: 2.5rem; color: hsl(var(--color-primary));"></i>
      </div>
      <div class="card flex items-center justify-between">
         <div>
            <h4 class="mb-1 text-muted">הושלמו (30 יום)</h4>
            <div id="stat-done" style="font-size: 1.5rem; font-weight: 700;">--</div>
         </div>
         <i class='bx bx-check-shield' style="font-size: 2.5rem; color: hsl(var(--color-success));"></i>
      </div>
    </div>
    
    <div id="learner-courses" class="grid grid-cols-3 slide-up" style="gap: var(--gap-standard);">
      <div class="text-center" style="grid-column: 1 / -1; padding: 3rem;">
        <i class='bx bx-loader bx-spin' style="font-size: 2rem;"></i> במידה ויש לומדות מוקצות הן יטענו...
      </div>
    </div>
  `

  const coursesContainer = container.querySelector('#learner-courses');
  const welcomeContainer = container.querySelector('#welcome-message-container');
  
  try {
    const [assignments, org] = await Promise.all([
      fetchLearnerAssignments(),
      user.orgId ? fetchOrganizationById(user.orgId) : Promise.resolve(null)
    ]);

    // Handle Welcome Message
    if (org?.welcome_message) {
        welcomeContainer.innerHTML = `
           <div class="card mb-6 slide-up" style="background: linear-gradient(135deg, hsl(var(--color-primary)/0.08) 0%, transparent 100%); border-right: 5px solid hsl(var(--color-primary)); padding: 1.25rem 2rem;">
              <div class="flex gap-4 items-center">
                 <div style="font-size: 1.5rem; color: hsl(var(--color-primary)); flex-shrink: 0;"><i class='bx bxs-megaphone'></i></div>
                 <p style="margin:0; font-weight: 500; font-size: 1.1rem; line-height: 1.4; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;">${org.welcome_message}</p>
              </div>
           </div>
        `;
    }
    
    if (assignments.length === 0) {
      coursesContainer.innerHTML = `<div class="card" style="grid-column: 1 / -1; padding: 3rem; text-align: center;">בינתיים אין לומדות שצריך לבצע</div>`;
      document.getElementById('stat-pending').textContent = '0';
      document.getElementById('stat-progress').textContent = '0';
      document.getElementById('stat-done').textContent = '0';
      return;
    }
    
    let pending = 0, inProg = 0, done = 0;
    
    const coursesHtml = assignments.map(course => {
      let hebrewStatus = 'טרם הותחל';
      let statusColorMsg = '';
      if (course.status === 'completed') { hebrewStatus = 'הושלם'; done++; statusColorMsg = 'color: hsl(var(--color-success));' }
      else if (course.status === 'in_progress') { hebrewStatus = 'בתהליך'; inProg++; }
      else { pending++; }
        
      return `
        <div class="card course-card">
          <div class="flex items-center gap-3 mb-3">
            <div class="icon-box" style="font-size: 2.5rem; color: hsl(var(--color-primary)); background: hsl(var(--color-primary)/0.1); padding: 1rem; border-radius: 50%;">
              <i class='bx ${course.image}'></i>
            </div>
            <div>
              <h3 style="margin: 0; font-size: ${course.title.length > 20 ? '0.95rem' : '1.1rem'}; line-height: 1.2; font-weight: 700;" title="${course.title}">${course.title}</h3>
              <p class="text-sm text-muted" style="max-height: 2.8em; overflow: hidden;">${course.desc || 'קורס העשרה לעובדים'}</p>
            </div>
          </div>
          
          <div class="progress-section mb-3">
            <div class="flex justify-between text-sm mb-1">
              <span style="font-weight: 500; ${statusColorMsg}">${hebrewStatus}</span>
              <span>${course.progress}%</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill ${course.progress === 100 ? 'bg-success' : ''}" style="width: ${course.progress}%; ${course.progress === 100 ? 'background: hsl(var(--color-success));' : ''}"></div>
            </div>
          </div>
          
          <div class="flex justify-between items-center text-sm mb-4" style="color: hsl(var(--text-muted)); display: ${course.score ? 'flex' : 'none'};">
            <span>ציון סופי: <strong style="color: ${course.score >= 80 ? 'hsl(var(--color-success))' : 'hsl(var(--color-danger))'};">${course.score || '-'}</strong></span>
          </div>
          
          <button class="btn btn-primary w-full justify-center" onclick="window.location.hash = '#/player?id=${course.id}'">
            ${course.status === 'completed' ? 'סקור מחדש' : course.status === 'in_progress' ? 'המשך למידה' : 'התחל עכשיו'}
          </button>
          <div id="msg-${course.id}" class="text-sm mt-2 font-medium" style="color: hsl(var(--color-primary)); text-align: center; min-height: 1.5rem;"></div>
        </div>
      `;
    }).join('');
    
    coursesContainer.innerHTML = coursesHtml;
    
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-progress').textContent = inProg;
    document.getElementById('stat-done').textContent = done;
    
  } catch (err) {
    coursesContainer.innerHTML = `<div class="card" style="grid-column: 1 / -1; text-align: center; color: hsl(var(--color-danger));">שגיאה בטעינת הקורסים: ${err.message}</div>`;
  }
}
