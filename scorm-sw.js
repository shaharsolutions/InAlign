const SW_VERSION = 'scorm-proxy-v3';
const SUPABASE_URL = 'https://iduyexkzivtnvrdsbwig.supabase.co/storage/v1/object/public/scorm_packages/';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only proxy requests matching /scorm-proxy/
    if (!url.pathname.startsWith('/scorm-proxy/')) return;

    const proxyPath = url.pathname.replace('/scorm-proxy/', '');
    const targetUrl = SUPABASE_URL + proxyPath + url.search;
    const isHtml = proxyPath.endsWith('.html') || proxyPath.endsWith('.htm');

    event.respondWith(
        fetch(targetUrl, { cache: 'no-cache' }).then(async response => {
            if (!response.ok) return response;

            // For HTML files: inject the SCORM API bridge so window.parent.API is accessible
            if (isHtml) {
                const text = await response.text();

                // The bridge injection: grabs the API from the top-level window (the LMS)
                // Works by traversing up through any iframe nesting
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

                return new Response(patched, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-cache',
                    }
                });
            }

            // For all other assets: pass through transparently
            return response;
        }).catch(error => {
            console.error('[SW] SCORM proxy fetch failed for:', targetUrl, error);
            return new Response('SCORM asset not found', { status: 502 });
        })
    );
});
