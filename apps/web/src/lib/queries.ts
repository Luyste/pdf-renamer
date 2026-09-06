import type { BatchState } from '@org/shared-types';
import { useQuery } from '@tanstack/react-query';
import { fetchBatchState } from './api';

export function useBatchState(batchId: string | null) {
  return useQuery<BatchState>({
    queryKey: ['batch', batchId],
    queryFn: () => fetchBatchState(batchId as string),
    enabled: !!batchId,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}
