import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { isMock } from './config/app';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) =>
        count < 2 && (err as { kind?: string }).kind !== 'schema' && (err as { kind?: string }).kind !== 'not-found',
      refetchOnWindowFocus: false,
    },
  },
});

async function boot() {
  if (isMock) {
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
