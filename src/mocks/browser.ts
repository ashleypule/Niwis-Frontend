import { setupWorker } from 'msw/browser';
import { handlers } from './handlers/router';

export const worker = setupWorker(...handlers);

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
