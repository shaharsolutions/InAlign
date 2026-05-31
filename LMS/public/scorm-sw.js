const SW_VERSION = 'scorm-proxy-v8';
const CACHE_PREFIX = 'inalign-scorm-assets';
let cacheName = `${CACHE_PREFIX}-session-${SW_VERSION}`;
const SCORM_ASSET_URL = 'https://iduyexkzivtnvrdsbwig.functions.supabase.co/scorm-asset';
const AUTH_DB_NAME = 'inalign-scorm-auth';
const AUTH_STORE_NAME = 'session';
let authToken = null;

self.addEventListener('install', event => {
    self.skipWaiting();
});

function sanitizeCachePart(value) {
    return String(value || 'session').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function decodeJwtSub(token) {
    try {
        const payload = token.split('.')[1];
        if (!payload) return '';
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
        return JSON.parse(json).sub || '';
    } catch (e) {
        return '';
    }
}

function cleanupCaches() {
    return caches.keys().then(keys => Promise.all(
        keys
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== cacheName)
            .map(key => caches.delete(key))
    ));
}

function openAuthDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(AUTH_DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(AUTH_STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function storeAuthToken(token, userId) {
    const db = await openAuthDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(AUTH_STORE_NAME, 'readwrite');
        tx.objectStore(AUTH_STORE_NAME).put({
            token,
            userId,
            savedAt: Date.now()
        }, 'auth');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

async function loadStoredAuthToken() {
    if (authToken) return authToken;

    const db = await openAuthDb();
    const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(AUTH_STORE_NAME, 'readonly');
        const request = tx.objectStore(AUTH_STORE_NAME).get('auth');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    db.close();

    if (record && record.token) {
        authToken = record.token;
        const cacheUserId = record.userId || decodeJwtSub(authToken) || 'session';
        cacheName = `${CACHE_PREFIX}-${sanitizeCachePart(cacheUserId)}-${SW_VERSION}`;
    }

    return authToken;
}

function setAuthToken(token, userId) {
    authToken = token || null;
    const cacheUserId = userId || decodeJwtSub(authToken || '') || 'session';
    cacheName = `${CACHE_PREFIX}-${sanitizeCachePart(cacheUserId)}-${SW_VERSION}`;
    if (authToken) {
        storeAuthToken(authToken, cacheUserId).catch(() => {});
    }
    cleanupCaches().catch(() => {});
}

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key.startsWith(CACHE_PREFIX) && !key.endsWith(SW_VERSION))
                    .map(key => caches.delete(key))
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SET_AUTH_TOKEN') {
        setAuthToken(event.data.token, event.data.userId);
    }
});

async function fetchScormAsset(proxyPath) {
    const token = await loadStoredAuthToken();
    if (!token) {
        return Promise.resolve(new Response('Missing SCORM authorization token', { status: 401 }));
    }

    const targetUrl = `${SCORM_ASSET_URL}?path=${encodeURIComponent(proxyPath)}`;
    return fetch(targetUrl, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'x-scorm-path': proxyPath
        },
        credentials: 'omit',
        cache: 'no-store'
    });
}

function cacheKeyFor(url) {
    const cacheUrl = new URL(url.href);
    cacheUrl.searchParams.delete('lms_token');
    return new Request(cacheUrl.toString(), { method: 'GET' });
}

function shouldCacheAsset(proxyPath, response) {
    if (!response || !response.ok) return false;
    const ext = proxyPath.split('?')[0].split('.').pop().toLowerCase();
    return ['js', 'css', 'json', 'xml', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'woff', 'woff2', 'ttf', 'otf'].includes(ext);
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only proxy requests matching /scorm-proxy/
    if (!url.pathname.includes('scorm-proxy/')) return;

    const proxyToken = 'scorm-proxy/';
    const tokenIndex = url.pathname.indexOf(proxyToken);
    const proxyPath = url.pathname.substring(tokenIndex + proxyToken.length);
    const requestToken = url.searchParams.get('lms_token');
    if (requestToken) setAuthToken(requestToken);
    
    const isHtml = proxyPath.endsWith('.html') || proxyPath.endsWith('.htm');

    if (isHtml) {
        // HTML files: proxy through an authenticated Edge Function so private SCORM packages are not public.
        event.respondWith(
            fetchScormAsset(proxyPath).then(async response => {
                if (!response.ok) return response;
                
                const text = await response.text();
                const bridge = `<script>
(function() {
  function findAPI(win) {
    try {
      var attempts = 0;
      while (win && !win.API && !win.API_1484_11 && attempts < 10) {
        if (win.parent === win) break;
        win = win.parent;
        attempts++;
      }
      return (win && (win.API || win.API_1484_11)) ? win : null;
    } catch(e) { return null; }
  }
  var apiWin = findAPI(window.parent);
  if (apiWin) {
    window.API = apiWin.API;
    window.API_1484_11 = apiWin.API_1484_11 || apiWin.API;
  }
})();
</script>`;
                const patched = text.replace(/<head>/i, '<head>' + bridge);
                const newResponse = new Response(patched, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'private, max-age=300',
                    }
                });
                return newResponse;
            }).catch(async () => {
                return new Response('Offline - Course asset missing', { status: 503 });
            })
        );
    } else {
        // Static assets: cache per authenticated user so repeat launches do not re-fetch every SCORM asset.
        event.respondWith(
            loadStoredAuthToken().then(() => caches.open(cacheName)).then(cache => {
                const key = cacheKeyFor(url);
                return cache.match(key).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;

                    return fetchScormAsset(proxyPath).then(networkResponse => {
                        if (shouldCacheAsset(proxyPath, networkResponse)) {
                            cache.put(key, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            }).catch(error => {
                console.error('[SW] SCORM proxy fetch failed:', proxyPath, error);
                return new Response('SCORM asset not found', { status: 502 });
            })
        );
    }
});
