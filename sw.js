const ASSET_CACHE_VERSION = '93105322e30f6234';
const ASSET_CACHE_NAME = `tro-unity-assets-${ASSET_CACHE_VERSION}`;
const CACHEABLE_PREFIXES = [
  '/game-assets/builds/',
  '/unity/',
  '/save/',
];

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith('tro-unity-assets-') && name !== ASSET_CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !isCacheableAssetRequest(request)) return;

  event.respondWith(cacheFirst(request));
});

function isCacheableAssetRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin
    && CACHEABLE_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

async function cacheFirst(request) {
  if (request.cache === 'reload' || request.cache === 'no-store') {
    return fetch(request);
  }

  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    if (request.headers.has('range')) return rangeResponse(request, cached);
    return cached;
  }

  const response = await fetch(request);
  if (response.ok && response.status === 200 && !request.headers.has('range')) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function rangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!match) return cachedResponse;

  const source = await cachedResponse.arrayBuffer();
  const size = source.byteLength;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (start > end || end >= size) {
    return new Response(null, {
      headers: { 'Content-Range': `bytes */${size}` },
      status: 416,
    });
  }

  return new Response(source.slice(start, end + 1), {
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream',
    },
    status: 206,
  });
}
