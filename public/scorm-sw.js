const CACHE_NAME = 'scorm-proxy-v1';
const SUPABASE_URL = 'https://iduyexkzivtnvrdsbwig.supabase.co/storage/v1/object/public/scorm_packages/';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Check if the request is for our SCORM proxy
    if (url.pathname.startsWith('/scorm-proxy/')) {
        const proxyPath = url.pathname.replace('/scorm-proxy/', '');
        const search = url.search;
        const targetUrl = SUPABASE_URL + proxyPath + search;

        event.respondWith(
            fetch(targetUrl).then(response => {
                // Just return the original response from Supabase
                return response;
            }).catch(error => {
                console.error('[SW] SCORM proxy fetch failed:', error);
                return new Response('Failed to load SCORM asset', { status: 502 });
            })
        );
    }
});
