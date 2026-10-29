import { setupWorker } from 'msw/browser';
import { http, passthrough } from 'msw';
import { APP, isLivePath } from '@/config/app';
import { fixtureResponse } from './fixtures';
import { SAMPLE_HEADER } from '@/api/client';
import { handlers } from './handlers/router';

/**
 * Hybrid mode: live paths go to the network (→ Vite proxy → backend) unless the client explicitly asks for the sample
 * version. Returning nothing falls through to the mock handlers.
 */
const live = http.all('*/api/v1/*', async ({ request }) => {
  const url = new URL(request.url);
  if (!isLivePath(url.pathname) || request.headers.get(SAMPLE_HEADER)) return;
  if (!APP.fixtures) return passthrough();
  // a POST (Forecasting Studio run) is keyed by its body; the recorded answer is the finished run
  const body =
    request.method === 'POST'
      ? await request
          .clone()
          .json()
          .catch(() => undefined)
      : undefined;
  return fixtureResponse(url, body);
});

export const worker = setupWorker(live, ...handlers);

export async function startMockWorker() {
  await worker.start({
    onUnhandledRequest: (req, print) => {
      // only API calls should go through MSW; static assets (geo, fonts, tiles) pass through silently
      if (new URL(req.url).pathname.startsWith('/api/')) print.warning();
    },
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}
