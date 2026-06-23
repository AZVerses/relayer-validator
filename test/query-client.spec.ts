import { describe, expect, it } from 'vitest';
import { createQueryClient } from '../web/src/query-client';

describe('admin web query client', () => {
  it('does not refetch stale queries when the browser window regains focus', () => {
    const queryClient = createQueryClient();

    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    });
  });
});
