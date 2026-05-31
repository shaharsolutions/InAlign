const SW_VERSION = 'scorm-proxy-v6';
const CACHE_NAME = `inalign-scorm-assets-${SW_VERSION}`;
const SCORM_ASSET_URL = 'https://iduyexkzivtnvrdsbwig.functions.supabase.co/scorm-asset';
let authToken = null;

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key.startsWith('inalign-scorm-assets-') && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SET_AUTH_TOKEN') {
        authToken = event.data.token || null;
    }
});

function fetchScormAsset(proxyPath) {
    if (!authToken) {
        return Promise.resolve(new Response('Missing SCORM authorization token', { status: 401 }));
    }

    const targetUrl = `${SCORM_ASSET_URL}?path=${encodeURIComponent(proxyPath)}`;
    return fetch(targetUrl, {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'x-scorm-path': proxyPath
        },
        credentials: 'omit',
        cache: 'no-store'
    });
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only proxy requests matching /scorm-proxy/
    if (!url.pathname.includes('scorm-proxy/')) return;

    const proxyToken = 'scorm-proxy/';
    const tokenIndex = url.pathname.indexOf(proxyToken);
    const proxyPath = url.pathname.substring(tokenIndex + proxyToken.length);
    const requestToken = url.searchParams.get('lms_token');
    if (requestToken) authToken = requestToken;
    
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
        // Static assets: always use the authenticated proxy; do not serve private assets from shared cache.
        event.respondWith(
            fetchScormAsset(proxyPath).catch(error => {
                console.error('[SW] SCORM proxy fetch failed:', proxyPath, error);
                return new Response('SCORM asset not found', { status: 502 });
            })
        );
    }
});
