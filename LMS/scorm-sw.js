const SW_VERSION = 'scorm-proxy-v4';
const CACHE_NAME = `inalign-scorm-assets-${SW_VERSION}`;
const SUPABASE_URL = 'https://iduyexkzivtnvrdsbwig.supabase.co/storage/v1/object/public/scorm_packages/';

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

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only proxy requests matching /scorm-proxy/
    if (!url.pathname.includes('scorm-proxy/')) return;

    const proxyToken = 'scorm-proxy/';
    const tokenIndex = url.pathname.indexOf(proxyToken);
    const proxyPath = url.pathname.substring(tokenIndex + proxyToken.length);
    const targetUrl = SUPABASE_URL + proxyPath + url.search;
    
    const isHtml = proxyPath.endsWith('.html') || proxyPath.endsWith('.htm');

    if (isHtml) {
        // HTML files: Network-First to ensure we always have the latest bridge but fall back to cache
        event.respondWith(
            fetch(targetUrl).then(async response => {
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
                        'Cache-Control': 'public, max-age=3600',
                    }
                });
                
                // Cache the patched version
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, newResponse.clone());
                return newResponse;
            }).catch(async () => {
                const cachedResponse = await caches.match(event.request);
                return cachedResponse || new Response('Offline - Course asset missing', { status: 503 });
            })
        );
    } else {
        // Static assets: Cache-First
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) return cachedResponse;

                return fetch(targetUrl).then(networkResponse => {
                    if (!networkResponse.ok) return networkResponse;

                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            }).catch(error => {
                console.error('[SW] SCORM proxy fetch failed:', targetUrl, error);
                return new Response('SCORM asset not found', { status: 502 });
            })
        );
    }
});
