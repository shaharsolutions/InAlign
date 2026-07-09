import { saveLearnerProgress, fetchCourseProgress } from '../api/progressApi.js'
import { fetchCourseById, getCourseContentLabel, getCourseContentType } from '../api/coursesApi.js'
import { getCurrentUserSync } from '../api/authApi.js'
import { supabase } from '../lib/supabase.js'
import { parseScormTime, formatScorm12Time } from '../lib/scormUtils.js'
import { clampProgress } from '../lib/progressUtils.js'
import { escapeAttr, escapeHtml } from '../lib/html.js'

let scormWorkerReady = null

function ensureScormWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!scormWorkerReady) {
    scormWorkerReady = navigator.serviceWorker.register('./scorm-sw.js')
      .then(() => navigator.serviceWorker.ready)
      .catch((err) => {
        console.error('[Align] SCORM worker registration failed:', err)
        return null
      })
  }
  return scormWorkerReady
}

async function prepareScormTransport(user) {
  const [registration, sessionResult] = await Promise.all([
    ensureScormWorker(),
    supabase ? supabase.auth.getSession() : Promise.resolve({ data: { session: null } })
  ])
  const accessToken = sessionResult?.data?.session?.access_token || ''
  const worker = navigator.serviceWorker?.controller || registration?.active
  if (worker && accessToken) {
    worker.postMessage({ type: 'SET_AUTH_TOKEN', token: accessToken, userId: user?.id })
  }
  return accessToken
}

function isScormDebugEnabled() {
  try {
    return typeof window !== 'undefined'
      && (window.localStorage?.getItem('inalign:debug') === '1'
        || window.localStorage?.getItem('inalign:scormDebug') === '1');
  } catch (e) {
    return false;
  }
}

function scormDebug(...args) {
  if (isScormDebugEnabled()) console.debug(...args);
}

async function getAuthenticatedProxyUrl(fileUrl, accessTokenPromise) {
  let proxyUrl = fileUrl;
  try {
    const accessToken = await accessTokenPromise
    if (accessToken) {
      proxyUrl += `${proxyUrl.includes('?') ? '&' : '?'}lms_token=${encodeURIComponent(accessToken)}`;
    }
  } catch (err) {
    console.error('[Align] Failed to prepare content authorization:', err);
  }
  return proxyUrl;
}

async function renderTrackedContentPlayer(container, { course, existingProgress, user, scormTransport }) {
  const courseId = course.id;
  const contentType = getCourseContentType(course);
  const contentLabel = getCourseContentLabel(course);
  const safeTitle = escapeHtml(course.title || 'תוכן למידה');
  const safeTitleAttr = escapeAttr(course.title || 'תוכן למידה');
  const baseProgress = existingProgress?.status === 'completed'
    ? 100
    : (existingProgress?.progress_percent === null || existingProgress?.progress_percent === undefined ? null : clampProgress(existingProgress.progress_percent));
  const runtime = {
    courseId,
    status: existingProgress?.status || 'not_started',
    progress: baseProgress,
    baseTimeSeconds: parseInt(existingProgress?.time_spent_seconds || 0),
    startTime: Date.now(),
    lastSync: 0,
    isExiting: false
  };

  const syncProgress = async ({ status = runtime.status, progress = runtime.progress, immediate = false } = {}) => {
    if (window._lmsActiveCourseId !== runtime.courseId) return;
    const now = Date.now();
    if (!immediate && now - runtime.lastSync < 12000) return;

    const elapsed = Math.floor((now - runtime.startTime) / 1000);
    const totalTime = runtime.baseTimeSeconds + elapsed;
    if (status === 'not_started' && totalTime > 5) status = 'in_progress';
    if (status === 'completed') progress = 100;

    runtime.status = status;
    runtime.progress = (progress === null || progress === undefined) ? null : clampProgress(progress);
    runtime.lastSync = now;

    await saveLearnerProgress(runtime.courseId, {
      status: runtime.status,
      progress: runtime.progress,
      score: null,
      time: totalTime,
      suspend_data: existingProgress?.suspend_data || '',
      lesson_location: contentType,
      org_id: course.org_id
    });
  };

  const exitPlayer = async ({ complete = false } = {}) => {
    if (runtime.isExiting) return;
    runtime.isExiting = true;
    if (window._lmsHeartbeat) clearInterval(window._lmsHeartbeat);
    await syncProgress({
      status: complete ? 'completed' : runtime.status,
      progress: complete ? 100 : runtime.progress,
      immediate: true
    });

    if (user?.isGuest) {
      container.innerHTML = `
        <div class="guest-completion-page">
          <div class="login-card-modern fade-in" style="text-align:center">
            <div style="font-size:4rem;color:hsl(var(--color-success));margin-bottom:1rem"><i class='bx bx-check-circle'></i></div>
            <h2>ההתקדמות נשמרה</h2>
            <p class="text-muted">תודה ${escapeHtml(user.fullName || '')}. ניתן לסגור את החלון.</p>
          </div>
        </div>
      `;
    } else {
      window.history.back();
    }
  };

  if (!course.fileUrl) {
    throw new Error("לא נמצאו קבצי תוכן עבור פריט זה. ייתכן שההעלאה נכשלה או שהקבצים נמחקו.");
  }

  const proxyUrl = await getAuthenticatedProxyUrl(course.fileUrl, scormTransport);
  const viewerHtml = contentType === 'video'
    ? `<video id="tracked-video" class="content-media-player" controls playsinline preload="metadata" src="${escapeAttr(proxyUrl)}"></video>`
    : `
      <iframe id="tracked-document" class="content-document-frame" title="${safeTitleAttr}" src="${escapeAttr(proxyUrl)}"></iframe>
      ${contentType === 'presentation' ? `
        <div class="content-viewer-fallback">
          <span class="text-sm text-muted">אם המצגת אינה מוצגת בדפדפן, ניתן לפתוח או להוריד אותה.</span>
          <a class="btn btn-outline text-sm" href="${escapeAttr(proxyUrl)}" target="_blank" rel="noopener">
            <i class='bx bx-link-external'></i> פתח מצגת
          </a>
        </div>
      ` : ''}
    `;

  container.innerHTML = `
    <div class="player-container">
      <div class="player-header">
        <div style="min-width:0">
          <div class="text-sm text-muted" style="margin-bottom:.2rem">${escapeHtml(contentLabel)}</div>
          <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeTitleAttr}">
            ${safeTitle}
          </h2>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline" id="content-complete-exit" style="display: flex; align-items: center; gap: 8px; padding: 0.5rem 1rem;">
            <i class='bx bx-check-circle'></i>
            <span>סמן כהושלם</span>
          </button>
          <button class="btn btn-primary" id="content-save-exit" style="display: flex; align-items: center; gap: 8px; padding: 0.5rem 1rem;">
            <i class='bx bx-log-out-circle'></i>
            <span>שמור וצא</span>
          </button>
        </div>
      </div>

      <div class="player-content content-player-surface">
        ${viewerHtml}
      </div>
    </div>
  `;

  window._lmsHeartbeat = setInterval(() => {
    syncProgress().catch(error => console.error('[Align] Content progress heartbeat failed:', error));
  }, 30000);

  const video = document.getElementById('tracked-video');
  if (video) {
    video.addEventListener('play', () => {
      syncProgress({ status: 'in_progress' }).catch(() => {});
    });
    video.addEventListener('timeupdate', () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        const progress = Math.min(99, Math.round((video.currentTime / video.duration) * 100));
        syncProgress({ status: 'in_progress', progress }).catch(() => {});
      }
    });
    video.addEventListener('ended', () => {
      syncProgress({ status: 'completed', progress: 100, immediate: true }).catch(() => {});
    });
  } else {
    syncProgress({ status: 'in_progress' }).catch(() => {});
  }

  document.getElementById('content-save-exit').addEventListener('click', () => {
    exitPlayer().catch(error => console.error('[Align] Content exit failed:', error));
  });
  document.getElementById('content-complete-exit').addEventListener('click', () => {
    exitPlayer({ complete: true }).catch(error => console.error('[Align] Content completion failed:', error));
  });

  window.addEventListener('beforeunload', () => {
    syncProgress({ immediate: true }).catch(() => {});
  }, { once: true });
}

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
  // Begin worker/session preparation alongside the two data requests below.
  // This removes the former extra wait between opening the course and the
  // iframe request, especially on a first visit.
  const scormTransport = prepareScormTransport(user);

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
    course.content_type = getCourseContentType(course);

    if (course.content_type !== 'scorm') {
      await renderTrackedContentPlayer(container, { course, existingProgress, user, scormTransport });
      return;
    }

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

    scormDebug(`[Align] Initial State for ${courseId}: Status=${runtime.status}, Location="${runtime.location}", Progress=${runtime.progress}%`);

    const syncProgressDebounced = (function() {
      let timeout = null;
      let pendingUpdates = null;
      let inFlightSync = null;
      
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
          if (inFlightSync) {
            await inFlightSync;
            if (!pendingUpdates) return;
          }

          while (pendingUpdates && window._lmsActiveCourseId === runtime.courseId) {
            const currentUpdates = { ...pendingUpdates };
            pendingUpdates = null;
            runtime.lastSync = Date.now();
            scormDebug(`[Align] Syncing (${label}): Loc="${currentUpdates.lesson_location}", Progress=${currentUpdates.progress}%`);

            inFlightSync = saveLearnerProgress(runtime.courseId, currentUpdates)
              .catch(e => {
                console.error(`[Align] Sync error:`, e.message);
              })
              .finally(() => {
                inFlightSync = null;
              });
            await inFlightSync;
          }
        };

        if (timeout) clearTimeout(timeout);
        if (immediate || label === "scorm_finish") {
          await performSync();
        } else if (label === "commit") {
          const syncDelay = now - runtime.lastSync < 8000 ? 1000 : 0;
          timeout = setTimeout(performSync, syncDelay);
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
        console.error("[Align] Exit sync failed:", e);
      } finally {
        if (user?.isGuest) {
          container.innerHTML = `
            <div class="guest-completion-page">
              <div class="login-card-modern fade-in" style="text-align:center">
                <div style="font-size:4rem;color:hsl(var(--color-success));margin-bottom:1rem"><i class='bx bx-check-circle'></i></div>
                <h2>ההתקדמות נשמרה</h2>
                <p class="text-muted">תודה ${user.fullName || ''}. ניתן לסגור את החלון.</p>
              </div>
            </div>
          `
        } else {
          window.history.back();
        }
      }
    };

    const API = {
      _initialized: false,
      Initialize: (n) => { 
          scormDebug("[Align] SCORM Initialize called");
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
        
        scormDebug(`[Align] GetValue(${n}) -> "${val}"`);
        return val;
      },
      LMSGetValue: (n) => API.GetValue(n),

      SetValue: (n, v) => {
        const key = n.toLowerCase();
        let changed = false;

        scormDebug(`[Align] SetValue(${n}, "${v}")`);

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
          scormDebug("[Align] SCORM Commit called");
          syncProgressDebounced("commit").catch(() => {}); 
          return "true"; 
      },
      LMSCommit: () => API.Commit(),
      
      Finish: () => { 
          scormDebug("[Align] SCORM Finish called - exiting");
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
            ${escapeHtml(course.title)}
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
            <iframe id="scorm-iframe" title="${escapeAttr(course.title)}" style="width: 100%; height: 100%; border:0; opacity:0; transition: opacity 0.5s ease;"></iframe>
          </div>
        </div>
      </div>
    `;

    const iframe = document.getElementById('scorm-iframe');
    const loader = document.getElementById('iframe-loader');
    const loaderStatus = document.getElementById('iframe-loader-status');
    let loaderHidden = false;
    let iframeLoaded = false;

    const setLoaderStatus = (text) => {
      if (loaderStatus) loaderStatus.textContent = text;
    };

    const hideLoader = () => {
      if (loaderHidden) return;
      loaderHidden = true;
      setLoaderStatus('הלומדה מוכנה');
      iframe.style.opacity = '1';
      if (loader) {
        loader.setAttribute('aria-busy', 'false');
        loader.classList.add('is-loaded');
        setTimeout(() => loader.remove(), 650);
      }
    };

    const maybeHideLoader = () => {
      if (!iframeLoaded) return;
      // iframe.onload means its document is available. Waiting for a second
      // SCORM signal here used to keep a fully loaded course hidden for 3.5s.
      hideLoader();
    };

    const onScormReady = (event) => {
      if (event.detail?.courseId !== runtime.courseId) return;
      setLoaderStatus('מחבר את הלומדה למערכת...');
      maybeHideLoader();
    };

    window.addEventListener('lms:scorm-ready', onScormReady);
    
    if (!course.fileUrl) {
        throw new Error("לא נמצאו קבצי לומדה עבור קורס זה. ייתכן שההעלאה נכשלה או שהקבצים נמחקו.");
    }

    const proxyUrl = await getAuthenticatedProxyUrl(course.fileUrl, scormTransport);

    iframe.onload = () => {
        setLoaderStatus('מסיים טעינה...');
        iframeLoaded = true;
        requestAnimationFrame(maybeHideLoader);
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
