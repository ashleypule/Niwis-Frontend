import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { usesMsw } from './config/app';
import { isRetryable } from './api/client';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // no retry for answers (4xx, 501 DATA_UNAVAILABLE, schema drift); twice with backoff for network errors and 5xx
      retry: (count, err) => count < 2 && isRetryable(err),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

async function boot() {
  // mock and hybrid: MSW answers the sample endpoints and passes live ones through to the backend
  if (usesMsw) {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void boot();
