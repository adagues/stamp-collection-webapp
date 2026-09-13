import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/catalog', () => ({
  getStamp: () => ({ image_url: 'https://www.phil-ouest.com/test-synthetic.jpg' }),
}));
import { GET } from '@/app/api/image/[id]/route';

afterEach(() => vi.unstubAllGlobals());

it('does not authorize shared caching of relayed third-party images', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
    headers: { 'content-type': 'image/jpeg' },
  })));
  const response = await GET(new Request('http://localhost/api/image/demo'), {
    params: { id: 'demo' },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
