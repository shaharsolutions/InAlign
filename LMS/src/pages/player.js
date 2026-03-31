import { saveLearnerProgress, fetchCourseProgress } from '../api/progressApi.js'
import { fetchCourseById } from '../api/coursesApi.js'
import { getCurrentUserSync } from '../api/authApi.js'
import { parseScormTime, formatScorm12Time } from '../lib/scormUtils.js'

// Aggressive global cleanup for intervals
if (window._lmsHeartbeat) clearInterval(window._lmsHeartbeat);
window._lmsActiveCourseId = null;

export default async function renderPlayer(container) {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const courseId = urlParams.get('id') || 'unknown'
  const user = getCurrentUserSync();

  // Update global tracking
  if (window._lmsHeartbeat) clearInterval(window._lmsHeartbeat);
  window._lmsActiveCourseId = courseId;

    container.innerHTML = `
      <div class="player-container items-center justify-center">
        <div style="text-align: center;">
          <i class='bx bx-loader-alt bx-spin' style="font-size: 4rem; color: #3b82f6;"></i>
          <p style="margin-top: 1.5rem; color: #94a3b8; font-size: 1.25rem; font-weight: 500;">טוען את נתוני הקורס...</p>
        </div>
      </div>
    `;

  try {
    const [course, existingProgress] = await Promise.all([
      fetchCourseById(courseId),
      fetchCourseProgress(courseId)
    ]);

    if (!course) throw new Error("הקורס לא נמצא");

    const runtime = {
      courseId: courseId,
      status: existingProgress?.status || 'not_started',
      progress: parseInt(existingProgress?.progress_percent || 0),
      score: parseInt(existingProgress?.score || 0),
      baseTimeSeconds: parseInt(existingProgress?.time_spent_seconds || 0),
      sessionTimeSeconds: 0,
      startTime: Date.now(),
      suspendData: existingProgress?.suspend_data || '',
      location: existingProgress?.lesson_location || '',
      lastSync: 0,
      isExiting: false
    };

    console.warn(`[InAlign] Initial State for ${courseId}: Status=${runtime.status}, Location="${runtime.location}", Progress=${runtime.progress}%`);

    const syncProgress = async (label = "periodic") => {
      if (window._lmsActiveCourseId !== runtime.courseId) return;

      const now = Date.now();
      if (label === "heartbeat" && now - runtime.lastSync < 15000) return; 
      
      const elapsed = Math.floor((now - runtime.startTime) / 1000);
      const totalTime = runtime.baseTimeSeconds + Math.max(runtime.sessionTimeSeconds, elapsed);
      
      if (runtime.status === 'not_started' && totalTime > 15) runtime.status = 'in_progress';
      
      let finalProgress = runtime.progress;
      // UI Boost: Ensure at least 5% if in progress, but if we have real progress (like 14%), use it!
      if (runtime.status === 'in_progress' && finalProgress < 5) finalProgress = 5;
      if (runtime.status === 'completed') finalProgress = 100;

      runtime.lastSync = now;
      console.log(`[InAlign] Syncing (${label}): Loc="${runtime.location}", Progress=${finalProgress}%`);

      try {
        await saveLearnerProgress(runtime.courseId, { 
          status: runtime.status,
          progress: finalProgress,
          score: runtime.score,
          time: totalTime,
          suspend_data: runtime.suspendData,
          lesson_location: runtime.location
        });
      } catch (e) {
          console.error(`[InAlign] Sync error:`, e.message);
      }
    };

    window._lmsHeartbeat = setInterval(() => {
        syncProgress("heartbeat").catch(() => {});
    }, 20000);

    const handleExit = async (label = "exit") => {
      if (runtime.isExiting) return;
      runtime.isExiting = true;

      const saveBtn = document.getElementById('scorm-save-exit');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'מתנתק...';
      }

      if (window._lmsHeartbeat) clearInterval(window._lmsHeartbeat);
      
      try {
        await syncProgress(label);
      } catch (e) {
        console.error("[InAlign] Exit sync failed:", e);
      } finally {
        window.history.back();
      }
    };

    const API = {
      _initialized: false,
      Initialize: (n) => { 
          console.warn("[InAlign] SCORM Initialize called");
          API._initialized = true; 
          return "true"; 
      },
      LMSInitialize: (n) => API.Initialize(n),
      
      GetValue: (n) => {
        const key = n.toLowerCase();
        let val = "";
        
        if (key.includes('student_name')) val = user?.fullName || "Learner";
        else if (key.includes('lesson_status') || key.includes('completion_status')) {
            val = runtime.status === 'completed' ? 'completed' : (runtime.status === 'in_progress' ? 'incomplete' : 'not attempted');
        }
        else if (key.includes('location')) val = runtime.location || "";
        else if (key.includes('suspend_data')) val = runtime.suspendData || "";
        else if (key.includes('score.raw')) val = String(runtime.score || 0);
        else if (key.includes('progress_measure')) val = String(runtime.progress / 100);
        else if (key.includes('entry')) val = (runtime.baseTimeSeconds > 5 || runtime.location) ? "resume" : "ab-initio";
        else if (key.includes('total_time')) val = formatScorm12Time(runtime.baseTimeSeconds);
        
        console.log(`[InAlign] GetValue(${n}) -> "${val}"`);
        return val;
      },
      LMSGetValue: (n) => API.GetValue(n),

      SetValue: (n, v) => {
        const key = n.toLowerCase();
        let changed = false;

        console.log(`[InAlign] SetValue(${n}, "${v}")`);

        if (key.includes('lesson_status') || key.includes('completion_status')) {
            const status = (v === 'passed' || v === 'completed') ? 'completed' : 'in_progress';
            if (runtime.status !== status) { runtime.status = status; changed = true; }
        }
        else if (key.includes('location')) {
            if (v && runtime.location !== v) { runtime.location = v; changed = true; }
        }
        else if (key.includes('suspend_data')) {
            if (v && runtime.suspendData !== v) { runtime.suspendData = v; changed = true; }
        }
        else if (key.includes('score.raw')) {
            const num = parseInt(v);
            if (!isNaN(num)) { runtime.score = num; changed = true; }
        }
        else if (key.includes('progress_measure')) {
            const p = Math.round(parseFloat(v) * 100);
            if (!isNaN(p) && p !== runtime.progress) { runtime.progress = p; changed = true; }
        }
        else if (key.includes('progress_percent')) {
            const p = parseInt(v);
            if (!isNaN(p) && p !== runtime.progress) { runtime.progress = p; changed = true; }
        }
        else if (key.includes('session_time')) {
            runtime.sessionTimeSeconds = parseScormTime(v);
            // Don't mark as changed for just session time to avoid spamming, wait for Commit
        }

        if (changed) {
            syncProgress("setValue").catch(() => {});
        }
        return "true";
      },
      LMSSetValue: (n, v) => API.SetValue(n, v),
      
      Commit: () => { 
          console.log("[InAlign] SCORM Commit called");
          syncProgress("commit").catch(() => {}); 
          return "true"; 
      },
      LMSCommit: () => API.Commit(),
      
      Finish: () => { 
          console.warn("[InAlign] SCORM Finish called - exiting");
          handleExit("scorm_finish");
          return "true"; 
      },
      LMSFinish: () => API.Finish(),
      Terminate: () => API.Finish(),
      
      GetLastError: () => "0", LMSGetLastError: () => "0",
      GetErrorString: () => "", LMSGetErrorString: () => "",
      GetDiagnostic: () => "", LMSGetDiagnostic: () => ""
    };

    window.API = window.API_1484_11 = API;

    container.innerHTML = `
      <div class="player-container">
        <div class="player-header">
          <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${course.title}
          </h2>
          <button class="btn btn-primary" id="scorm-save-exit" style="display: flex; align-items: center; gap: 8px; padding: 0.5rem 1rem;">
            <i class='bx bx-log-out-circle'></i>
            <span>שמור וצא</span>
          </button>
        </div>

        <div class="player-content">
          <div class="player-frame-wrapper">
            <div id="iframe-loader" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #000; z-index: 10;">
              <div style="text-align: center;">
                <i class='bx bx-loader-alt bx-spin' style="font-size: 3.5rem; color: #3b82f6;"></i>
                <p style="color: #94a3b8; margin-top: 1rem; font-weight: 500;">טוען את הלומדה...</p>
              </div>
            </div>
            <iframe id="scorm-iframe" style="width: 100%; height: 100%; border:0; opacity:0; transition: opacity 0.5s ease;"></iframe>
          </div>
        </div>
      </div>
    `;

    const iframe = document.getElementById('scorm-iframe');
    
    if (!course.fileUrl) {
        throw new Error("לא נמצאו קבצי לומדה עבור קורס זה. ייתכן שההעלאה נכשלה או שהקבצים נמחקו.");
    }

    if ('serviceWorker' in navigator) {
      try {
        // Register relative to current location to support subdirectory deployments
        await navigator.serviceWorker.register('./scorm-sw.js');
        await navigator.serviceWorker.ready;
      } catch (err) {
        console.error('[InAlign] SW registration failed:', err);
      }
    }

    let proxyUrl = course.fileUrl;
    try {
       const urlObj = new URL(course.fileUrl);
       const pathPart = urlObj.pathname.split('scorm_packages/')[1];
       if (pathPart) {
           // Use relative path for proxy to ensure it hits the Service Worker scope
           proxyUrl = 'scorm-proxy/' + pathPart + urlObj.search;
       }
    } catch(e) {
       console.error('[InAlign] URL parse error', e);
    }
    
    iframe.src = proxyUrl;
    
    iframe.onload = () => { 
        document.getElementById('iframe-loader').style.display = 'none'; 
        iframe.style.opacity = '1'; 
    };

    document.getElementById('scorm-save-exit').addEventListener('click', async () => { 
        try { iframe.contentWindow.dispatchEvent(new Event('unload')); } catch(e) {}
        await handleExit("manual_exit");
    });

  } catch (err) { container.innerHTML = `<div class="p-8 text-center text-danger">${err.message}</div>`; }
}
