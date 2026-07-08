const SW_VERSION = 'scorm-proxy-v12';
const CACHE_PREFIX = 'inalign-scorm-assets';
let cacheName = `${CACHE_PREFIX}-session-${SW_VERSION}`;
const SCORM_ASSET_URL = 'https://kvlwkmappgpamigxoiwc.functions.supabase.co/scorm-asset';
const AUTH_DB_NAME = 'inalign-scorm-auth';
const AUTH_STORE_NAME = 'session';
let authToken = null;
const clientCourseRoots = new Map();
const inFlightRequests = new Map();
const ABSOLUTE_SCORM_PREFIXES = ['html5/', 'story_content/'];

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
    const operations = [];
    if (authToken) {
        operations.push(storeAuthToken(authToken, cacheUserId));
    }
    operations.push(cleanupCaches());
    return Promise.allSettled(operations);
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
        event.waitUntil(setAuthToken(event.data.token, event.data.userId));
    }
});

async function fetchScormAsset(proxyPath, rangeHeader = '') {
    const token = await loadStoredAuthToken();
    if (!token) {
        return Promise.resolve(new Response('Missing SCORM authorization token', { status: 401 }));
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'x-scorm-path': proxyPath
    };
    if (rangeHeader) headers.Range = rangeHeader;

    const targetUrl = `${SCORM_ASSET_URL}?path=${encodeURIComponent(proxyPath)}`;
    return fetch(targetUrl, {
        headers,
        credentials: 'omit',
        cache: 'no-store'
    });
}

function cacheKeyFor(url, proxyPath = '') {
    const cacheUrl = proxyPath
        ? new URL(`/scorm-proxy/${proxyPath}`, self.location.origin)
        : new URL(url.href);
    cacheUrl.searchParams.delete('lms_token');
    return new Request(cacheUrl.toString(), { method: 'GET' });
}

function shouldCacheAsset(proxyPath, response) {
    if (!response || !response.ok) return false;
    if (response.status === 206) return false;
    const ext = proxyPath.split('?')[0].split('.').pop().toLowerCase();
    return ['html', 'htm', 'js', 'css', 'json', 'xml', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'pdf', 'ppt', 'pptx', 'pps', 'ppsx', 'key', 'woff', 'woff2', 'ttf', 'otf'].includes(ext);
}

function parseRangeHeader(rangeHeader, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
    if (!match || !Number.isFinite(size) || size <= 0) return null;

    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

    if (!match[1] && match[2]) {
        const suffixLength = Number.parseInt(match[2], 10);
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
    return { start, end: Math.min(end, size - 1) };
}

async function partialResponseFromCache(cachedResponse, rangeHeader) {
    if (!rangeHeader || !cachedResponse || !cachedResponse.ok || cachedResponse.status === 206) return null;

    const buffer = await cachedResponse.clone().arrayBuffer();
    const range = parseRangeHeader(rangeHeader, buffer.byteLength);
    if (!range) return null;

    const headers = new Headers(cachedResponse.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(range.end - range.start + 1));
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`);

    return new Response(buffer.slice(range.start, range.end + 1), {
        status: 206,
        statusText: 'Partial Content',
        headers
    });
}

function getCourseRoot(proxyPath) {
    const match = proxyPath.match(/^(org_[^/]+\/courses\/[^/]+\/)/);
    return match ? match[1] : '';
}

function rememberCourseRoot(clientId, proxyPath) {
    const root = getCourseRoot(proxyPath);
    if (clientId && root) clientCourseRoots.set(clientId, root);
    return root;
}

function resolveAbsoluteScormPath(clientId, pathname) {
    const cleanPath = pathname.replace(/^\/+/, '');
    if (!ABSOLUTE_SCORM_PREFIXES.some(prefix => cleanPath.startsWith(prefix))) return '';
    const root = clientCourseRoots.get(clientId);
    return root ? `${root}${cleanPath}` : '';
}

function rewriteScormCssUrls(text, courseRoot) {
    if (!courseRoot) return text;
    const base = `/scorm-proxy/${courseRoot}`;
    return text
        .replace(/url\((['"]?)\/(html5|story_content)\//g, `url($1${base}$2/`)
        .replace(/@import\s+(["'])\/(html5|story_content)\//g, `@import $1${base}$2/`);
}

function getScormApiBridgeScript() {
    return `<script>
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
}

function rewriteScormHtml(text, courseRoot) {
    const baseTag = courseRoot ? `<base href="/scorm-proxy/${courseRoot}">` : '';
    const injection = `${baseTag}${getScormApiBridgeScript()}`;
    return /<head>/i.test(text)
        ? text.replace(/<head>/i, `<head>${injection}`)
        : `${injection}${text}`;
}

async function normalizeHtmlResponse(response, proxyPath) {
    if (!response.ok) return response;

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'private, max-age=3600');

    const courseRoot = getCourseRoot(proxyPath);
    const text = await response.text();
    return new Response(rewriteScormHtml(text, courseRoot), {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

async function normalizeAssetResponse(response, proxyPath) {
    if (!response.ok) return response;

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, max-age=3600');

    if (proxyPath.toLowerCase().endsWith('.css')) {
        const courseRoot = getCourseRoot(proxyPath);
        const text = await response.text();
        headers.set('Content-Type', 'text/css; charset=utf-8');
        return new Response(rewriteScormCssUrls(text, courseRoot), {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

async function respondWithCached(request, url, proxyPath, authReady, normalizeResponse) {
    await authReady;
    await loadStoredAuthToken();

    const cache = await caches.open(cacheName);
    const key = cacheKeyFor(url, proxyPath);
    const cachedResponse = await cache.match(key);
    const rangeHeader = request.headers.get('Range') || '';
    if (cachedResponse) {
        const partial = await partialResponseFromCache(cachedResponse, rangeHeader);
        return partial || cachedResponse;
    }

    const requestKey = rangeHeader ? `${key.url}::${rangeHeader}` : key.url;
    if (!inFlightRequests.has(requestKey)) {
        const requestPromise = fetchScormAsset(proxyPath, rangeHeader)
            .then(response => normalizeResponse(response, proxyPath))
            .then(async response => {
                if (shouldCacheAsset(proxyPath, response)) {
                    await cache.put(key, response.clone());
                }
                return response;
            })
            .finally(() => inFlightRequests.delete(requestKey));
        inFlightRequests.set(requestKey, requestPromise);
    }

    const response = await inFlightRequests.get(requestKey);
    return response.clone();
}

function respondWithCachedAsset(request, url, proxyPath, authReady) {
    return respondWithCached(request, url, proxyPath, authReady, normalizeAssetResponse);
}

function respondWithCachedHtml(request, url, proxyPath, authReady) {
    return respondWithCached(request, url, proxyPath, authReady, normalizeHtmlResponse);
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only proxy requests matching /scorm-proxy/
    if (!url.pathname.includes('scorm-proxy/')) {
        const absoluteScormPath = resolveAbsoluteScormPath(event.clientId, url.pathname);
        if (!absoluteScormPath) return;
        event.respondWith(
            respondWithCachedAsset(event.request, url, absoluteScormPath, Promise.resolve()).catch(error => {
                console.error('[SW] Absolute SCORM asset fetch failed:', absoluteScormPath, error);
                return new Response('SCORM asset not found', { status: 502 });
            })
        );
        return;
    }

    const proxyToken = 'scorm-proxy/';
    const tokenIndex = url.pathname.indexOf(proxyToken);
    const proxyPath = url.pathname.substring(tokenIndex + proxyToken.length);
    rememberCourseRoot(event.clientId, proxyPath);
    const requestToken = url.searchParams.get('lms_token');
    const authReady = requestToken ? setAuthToken(requestToken) : Promise.resolve();
    
    const isHtml = proxyPath.endsWith('.html') || proxyPath.endsWith('.htm');

    if (isHtml) {
        // HTML files: proxy through an authenticated Edge Function so private SCORM packages are not public.
        event.respondWith(
            respondWithCachedHtml(event.request, url, proxyPath, authReady).then(response => {
                rememberCourseRoot(event.clientId, proxyPath);
                return response;
            }).catch(async () => {
                return new Response('Offline - Course asset missing', { status: 503 });
            })
        );
    } else {
        // Static assets: cache per authenticated user so repeat launches do not re-fetch every SCORM asset.
        event.respondWith(
            respondWithCachedAsset(event.request, url, proxyPath, authReady).catch(error => {
                console.error('[SW] SCORM proxy fetch failed:', proxyPath, error);
                return new Response('SCORM asset not found', { status: 502 });
            })
        );
    }
});
