import { getStamp } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
const cache = new Map<string, { body: Uint8Array; type: string }>();
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const stamp = await getStamp(params.id);
  if (!stamp?.image_url) return Response.json({ error: 'Illustration indisponible.' }, { status: 404 });
  try {
    const url = new URL(stamp.image_url);
    const hosts = ['www.phil-ouest.com', ...(process.env.IMAGE_HOSTS || '').split(',').filter(Boolean)];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password)
      return Response.json({ error: 'Hébergement de l’illustration non autorisé.' }, { status: 403 });
    let image = cache.get(url.href);
    if (!image) {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
      const type = response.headers.get('content-type')?.split(';')[0] || '';
      if (!response.ok || !['image/jpeg','image/png','image/webp','image/gif'].includes(type) || !response.body) throw new Error();
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 5_000_000) { await reader.cancel(); throw new Error(); } chunks.push(value); }
      image = { body: new Uint8Array(Buffer.concat(chunks)), type };
      if (cache.size >= 50) cache.delete(cache.keys().next().value!);
      cache.set(url.href, image);
    }
    return new Response(image.body as BodyInit, { headers: { 'Content-Type': image.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: 'Le site source ne fournit pas cette illustration actuellement.' }, { status: 502 }); }
}
