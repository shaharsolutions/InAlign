import { saveLearnerProgress, fetchCourseProgress } from '../api/progressApi.js'
import { fetchCourseById } from '../api/coursesApi.js'
import { getCurrentUserSync } from '../api/authApi.js'
import { supabase } from '../lib/supabase.js'
import { parseScormTime, formatScorm12Time } from '../lib/scormUtils.js'
import { clampProgress } from '../lib/progressUtils.js'

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
      progress: clampProgress(existingProgress?.progress_percent || 0),
      score: parseInt(existingProgress?.score || 0),
      baseTimeSeconds: parseInt(existingProgress?.time_spent_seconds || 0),
      sessionTimeSeconds: 0,
      startTime: Date.now(),
      suspendData: existingProgress?.suspend_data || '',
      location: existingProgress?.lesson_location || '',
      lastSync: 0,
      hasExplicitProgress: existingProgress?.status === 'completed' || parseInt(existingProgress?.progress_percent || 0) > 0,
      isExiting: false
    };

    console.warn(`[InAlign] Initial State for ${courseId}: Status=${runtime.status}, Location="${runtime.location}", Progress=${runtime.progress}%`);

    const syncProgressDebounced = (function() {
      let timeout = null;
      let pendingUpdates = null;
      
      return async (label = "periodic", immediate = false) => {
        if (window._lmsActiveCourseId !== runtime.courseId) return;

        const now = Date.now();
        if (label === "heartbeat" && now - runtime.lastSync < 30000) return; 
        
        const elapsed = Math.floor((now - runtime.startTime) / 1000);
        const totalTime = runtime.baseTimeSeconds + Math.max(runtime.sessionTimeSeconds, elapsed);
        
        if (runtime.status === 'not_started' && totalTime > 15) runtime.status = 'in_progress';
        
        let finalProgress = runtime.hasExplicitProgress ? runtime.progress : null;
        if (runtime.status === 'completed') {
          finalProgress = 100;
          runtime.hasExplicitProgress = true;
        }
        if (finalProgress !== null) runtime.progress = Math.max(runtime.progress, finalProgress);

        pendingUpdates = { 
          status: runtime.status,
          progress: finalProgress,
          score: runtime.score,
          time: totalTime,
          suspend_data: runtime.suspendData,
          lesson_location: runtime.location,
          org_id: course.org_id // Pass org_id to avoid extra query in API
        };

        const performSync = async () => {
          if (!pendingUpdates || window._lmsActiveCourseId !== runtime.courseId) return;
          const currentUpdates = { ...pendingUpdates };
          pendingUpdates = null;
          runtime.lastSync = Date.now();
          console.log(`[InAlign] Syncing (${label}): Loc="${currentUpdates.lesson_location}", Progress=${currentUpdates.progress}%`);
          try {
            await saveLearnerProgress(runtime.courseId, currentUpdates);
          } catch (e) {
            console.error(`[InAlign] Sync error:`, e.message);
          }
        };

        if (timeout) clearTimeout(timeout);
        if (immediate || label === "commit" || label === "scorm_finish") {
          await performSync();
        } else {
          timeout = setTimeout(performSync, 5000); // 5s debounce for regular updates
        }
      };
    })();

    window._lmsHeartbeat = setInterval(() => {
        syncProgressDebounced("heartbeat").catch(() => {});
    }, 45000); // Increased interval for pulse

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
        await syncProgressDebounced(label, true);
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
          runtime.scormInitialized = true;
          window.dispatchEvent(new CustomEvent('lms:scorm-ready', { detail: { courseId: runtime.courseId } }));
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
        else if (key.includes('progress_measure')) val = runtime.hasExplicitProgress ? String(runtime.progress / 100) : "";
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
            if (!isNaN(p) && p !== runtime.progress) { runtime.progress = p; runtime.hasExplicitProgress = true; changed = true; }
        }
        else if (key.includes('progress_percent')) {
            const p = parseInt(v);
            if (!isNaN(p) && p !== runtime.progress) { runtime.progress = p; runtime.hasExplicitProgress = true; changed = true; }
        }
        else if (key.includes('session_time')) {
            runtime.sessionTimeSeconds = parseScormTime(v);
            // Don't mark as changed for just session time to avoid spamming, wait for Commit
        }

        if (changed) {
            syncProgressDebounced("setValue").catch(() => {});
        }
        return "true";
      },
      LMSSetValue: (n, v) => API.SetValue(n, v),
      
      Commit: () => { 
          console.log("[InAlign] SCORM Commit called");
          syncProgressDebounced("commit").catch(() => {}); 
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
            <div id="iframe-loader" class="scorm-loading-overlay" aria-live="polite" aria-busy="true">
              <div class="scorm-loading-card">
                <div class="scorm-loading-mark">
                  <i class='bx bx-shield-quarter'></i>
                </div>
                <h3>טוען את הלומדה</h3>
                <p id="iframe-loader-status">מכין את סביבת הלמידה...</p>
                <div class="scorm-loading-bar">
                  <span></span>
                </div>
              </div>
            </div>
            <iframe id="scorm-iframe" title="${course.title}" style="width: 100%; height: 100%; border:0; opacity:0; transition: opacity 0.5s ease;"></iframe>
          </div>
        </div>
      </div>
    `;

    const iframe = document.getElementById('scorm-iframe');
    const loader = document.getElementById('iframe-loader');
    const loaderStatus = document.getElementById('iframe-loader-status');
    let loaderHidden = false;
    let iframeLoaded = false;
    let scormReady = false;
    let fallbackTimer = null;

    const setLoaderStatus = (text) => {
      if (loaderStatus) loaderStatus.textContent = text;
    };

    const hideLoader = () => {
      if (loaderHidden) return;
      loaderHidden = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      setLoaderStatus('הלומדה מוכנה');
      iframe.style.opacity = '1';
      if (loader) {
        loader.setAttribute('aria-busy', 'false');
        loader.classList.add('is-loaded');
        setTimeout(() => loader.remove(), 650);
      }
    };

    const waitForIframeDocument = async () => {
      const maxAttempts = 40;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const doc = iframe.contentDocument;
          if (doc?.readyState === 'complete' && doc.body?.children?.length > 0) return true;
        } catch (e) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return false;
    };

    const maybeHideLoader = () => {
      if (!iframeLoaded) return;
      if (scormReady || runtime.scormInitialized) {
        hideLoader();
        return;
      }

      fallbackTimer = setTimeout(() => {
        if (!loaderHidden && iframeLoaded) hideLoader();
      }, 3500);
    };

    const onScormReady = (event) => {
      if (event.detail?.courseId !== runtime.courseId) return;
      scormReady = true;
      setLoaderStatus('מחבר את הלומדה למערכת...');
      maybeHideLoader();
    };

    window.addEventListener('lms:scorm-ready', onScormReady);
    
    if (!course.fileUrl) {
        throw new Error("לא נמצאו קבצי לומדה עבור קורס זה. ייתכן שההעלאה נכשלה או שהקבצים נמחקו.");
    }

    if ('serviceWorker' in navigator) {
      try {
        // Register relative to current location to support subdirectory deployments
        const registration = await navigator.serviceWorker.register('./scorm-sw.js');
        await navigator.serviceWorker.ready;
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          const accessToken = session?.access_token;
          const worker = registration.active || registration.waiting || registration.installing || navigator.serviceWorker.controller;
          if (worker && accessToken) {
            worker.postMessage({ type: 'SET_AUTH_TOKEN', token: accessToken });
          }
        }
      } catch (err) {
        console.error('[InAlign] SW registration failed:', err);
      }
    }

    let proxyUrl = course.fileUrl;
    if (window.navigator.serviceWorker) {
        await window.navigator.serviceWorker.ready;
    }

    iframe.onload = async () => {
        setLoaderStatus('מסיים טעינה...');
        await waitForIframeDocument();
        iframeLoaded = true;
        maybeHideLoader();
    };

    iframe.onerror = () => {
        setLoaderStatus('לא הצלחנו לטעון את הלומדה. נסה לרענן את העמוד.');
        if (loader) loader.classList.add('has-error');
    };

    setLoaderStatus('טוען קבצי לומדה...');
    iframe.src = proxyUrl;

    document.getElementById('scorm-save-exit').addEventListener('click', async () => { 
        window.removeEventListener('lms:scorm-ready', onScormReady);
        try { iframe.contentWindow.dispatchEvent(new Event('unload')); } catch(e) {}
        await handleExit("manual_exit");
    });

  } catch (err) { container.innerHTML = `<div class="p-8 text-center text-danger">${err.message}</div>`; }
}
