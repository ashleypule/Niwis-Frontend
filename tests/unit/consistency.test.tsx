import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { setupServer } from 'msw/node';
import { handlers } from '@/mocks/handlers/router';
import { TablePanel } from '@/components/table/TablePanel';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { EntityDetailSchema, KpiSetSchema, MapLayerSchema, TableSetSchema } from '@/types/api';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterAll(() => server.close());

const ID = 'dam-gariep';

describe('one source of truth per fact', () => {
  it('Gariep Dam %FSC is identical in the dam table, map marker and entity card', async () => {
    const table = await apiGet(endpoints.table('dams'), { metric: 'top10' }, TableSetSchema);
    const fromTable = Number(table.rows.find((r) => r.id === ID)!.pct);

    const map = await apiGet(endpoints.map('dams'), { layer: 'storage' }, MapLayerSchema);
    const fromMap = Number(map.points!.find((p) => p.id === ID)!.value);

    const entity = await apiGet(endpoints.entity('dams', ID), {}, EntityDetailSchema);
    const fromCard = Number(entity.fields.find((f) => f.label === 'Storage level')!.value);

    expect(fromMap).toBe(fromTable);
    expect(fromCard).toBe(fromTable);
  });

  it('Overview dam-storage KPI equals the Dams page total-storage KPI', async () => {
    const overview = await apiGet(endpoints.summary('overview'), {}, KpiSetSchema);
    const damsPage = await apiGet(endpoints.summary('dams'), {}, KpiSetSchema);
    expect(overview.kpis.find((k) => k.id === 'dams')!.value).toBe(
      damsPage.kpis.find((k) => k.id === 'storage')!.value,
    );
  });

  it('the Overview top-10 table (rendered) shows the same Gariep %FSC as the API', async () => {
    const table = await apiGet(endpoints.table('dams'), { metric: 'top10' }, TableSetSchema);
    const expected = Number(table.rows.find((r) => r.id === ID)!.pct).toFixed(1);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <TablePanel module="dams" metric="top10" title="Major Dam Storage (Top 10 by Capacity)" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const row = await waitFor(() => within(container).getByText('Gariep').closest('tr')!);
    expect(row.textContent).toContain(expected);
  });
});
