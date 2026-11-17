import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type SongDetail } from '@/services/api';

export const songKeys = {
  all: ['songs'] as const,
  detail: (id: string) => ['songs', id] as const,
};

export function useSongs() {
  return useQuery({ queryKey: songKeys.all, queryFn: api.listSongs });
}

const ACTIVE = new Set(['queued', 'processing']);

/** Song detail; polls every 1.5 s while analysis is running. */
export function useSong(id: string | undefined) {
  return useQuery({
    queryKey: songKeys.detail(id ?? ''),
    queryFn: () => api.getSong(id as string),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ACTIVE.has(q.state.data.status) ? 1500 : false),
  });
}

export function useUpdateSong(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.updateSong>[1]) => api.updateSong(id, body),
    onSuccess: (song: SongDetail) => {
      qc.setQueryData(songKeys.detail(id), song);
      void qc.invalidateQueries({ queryKey: songKeys.all, exact: true });
    },
  });
}

export function useDeleteSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSong,
    onSuccess: () => qc.invalidateQueries({ queryKey: songKeys.all }),
  });
}

export function useCorrectChord(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { start: number; original_label: string; corrected_label: string }) => api.correctChord(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: songKeys.detail(id) }),
  });
}

export function useRevertCorrection(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (correctionId: string) => api.revertCorrection(id, correctionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: songKeys.detail(id) }),
  });
}

export function useReanalyze(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.reanalyze(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: songKeys.detail(id) }),
  });
}
