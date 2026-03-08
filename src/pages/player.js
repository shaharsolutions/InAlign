import { saveLearnerProgress } from '../api/progressApi.js'

export default function renderPlayer(container) {
  // Extract course ID from hash (e.g., #/player?id=c1)
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const courseId = urlParams.get('id') || 'unknown'

  // Notify backend that user opened the course
  saveLearnerProgress(courseId, { status: 'in_progress', progress: Math.max(0, Math.floor(Math.random() * 20)), time: 0 });

  container.innerHTML = `
    <div class="fade-in" style="display: flex; flex-direction: column; height: calc(100vh - 120px);">
      <div class="flex justify-between items-center mb-3">
        <div>
          <h2 class="mb-1">נגן לומדה (SCORM)</h2>
          <p class="text-sm text-muted">מזהה קורס: ${courseId}</p>
        </div>
        <button class="btn btn-outline" onclick="window.history.back()">
          <i class='bx bx-arrow-back'></i> חזור לאזור האישי
        </button>
      </div>
      
      <div class="card" style="flex: 1; padding: 0; overflow: hidden; display: flex; flex-direction: column;">
        <!-- Mock iFrame for SCORM content -->
        <div style="background: #232323; color: white; padding: 0.5rem 1rem; display: flex; justify-content: space-between; align-items: center;">
          <span class="text-sm"><i class='bx bx-play-circle'></i> LMS Enterprise SaaS SCORM Runtime</span>
          <div class="flex gap-2">
             <button class="btn btn-primary text-sm" style="padding: 0.25rem 0.75rem;" id="scorm-action-btn"><i class='bx bx-save'></i> שמור התקדמות וסיים</button>
          </div>
        </div>
        <div style="flex: 1; min-height: 400px; display: flex; align-items: center; justify-content: center; background: hsl(var(--bg-body)); position: relative;">
          <div style="text-align: center;">
            <i class='bx bx-slideshow' style="font-size: 4rem; color: hsl(var(--border-color)); margin-bottom: 1rem;"></i>
            <h3>תוכן הלומדה (Iframe Area)</h3>
            <p class="text-muted text-sm mt-2">במוצר האמיתי ה-SCORM Cloud או SCORM RTE מקומי ירוץ כאן וישגר פונקציות CMI ל-LMS.</p>
            <div id="scorm-msg" class="mt-4 text-sm font-medium" style="color: hsl(var(--color-success));"></div>
          </div>
        </div>
      </div>
    </div>
  `

  setTimeout(() => {
    document.getElementById('scorm-action-btn').addEventListener('click', async () => {
      document.getElementById('scorm-msg').innerHTML = '<i class="bx bx-loader bx-spin"></i> מעדכן התקדמות ומסיים מול השרת...';
      try {
        // במוצר אמיתי כאן נשלוף את ההתקדמות והציון האמיתיים של ה-SCORM במקום ציון חלש של 100 קבוע
        await saveLearnerProgress(courseId, { status: 'completed', progress: 100, time: 1800 }); 
        document.getElementById('scorm-msg').innerHTML = 'ההדרכה נשמרה והושלמה בהצלחה. מחזיר לאזור אישי...';
        setTimeout(() => window.history.back(), 2000);
      } catch (err) {
        document.getElementById('scorm-msg').style.color = 'hsl(var(--color-danger))';
        document.getElementById('scorm-msg').innerHTML = 'שגיאה בשמירת ובסיום ההדרכה מול השרת.';
      }
    });
  }, 0);
}
