import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { applyPatch, removeCorrection, upsertCorrection, type ChordCorrection, type LocalSong, type SongPatch } from '@/features/library/model';
import { storage } from '@/features/library/storage';
import { localEngine } from '@/services/localEngine';

/** All song data comes from this device's storage; react-query just caches it. */
export const songKeys = {
  all: ['songs'] as const,
  detail: (id: string) => ['songs', id] as const,
  audio: (id: string) => ['songs', id, 'audio'] as const,
};

export function useSongs() {
  return useQuery({ queryKey: songKeys.all, queryFn: () => storage.list(), staleTime: Infinity });
}

export function useSong(id: string | undefined) {
  return useQuery({
    queryKey: songKeys.detail(id ?? ''),
    queryFn: async () => {
      const song = await storage.get(id as string);
      if (!song) throw new Error('This song is not on this device.');
      return song;
    },
    enabled: !!id,
    staleTime: Infinity,
    retry: false,
  });
}

export function useAudioUri(id: string | undefined) {
  return useQuery({
    queryKey: songKeys.audio(id ?? ''),
    queryFn: () => storage.audioUri(id as string),
    enabled: !!id,
    staleTime: Infinity,
    retry: false,
  });
}

/** Read-modify-write a song record, then refresh caches. */
function useSongMutation<T>(id: string, change: (song: LocalSong, arg: T) => LocalSong) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: T) => {
      const current = await storage.get(id);
      if (!current) throw new Error('This song is not on this device.');
      const next = change(current, arg);
      await storage.put(next);
      return next;
    },
    onSuccess: (song) => {
      qc.setQueryData(songKeys.detail(id), song);
      void qc.invalidateQueries({ queryKey: songKeys.all, exact: true });
    },
  });
}

export const useUpdateSong = (id: string) => useSongMutation<SongPatch>(id, (s, patch) => applyPatch(s, patch));
export const useCorrectChord = (id: string) => useSongMutation<ChordCorrection>(id, (s, c) => upsertCorrection(s, c));
export const useRevertCorrection = (id: string) => useSongMutation<number>(id, (s, start) => removeCorrection(s, start));

export function useDeleteSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => storage.remove(id),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: songKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: songKeys.all, exact: true });
    },
  });
}

export function useExportMp3() {
  return useMutation({ mutationFn: (song: LocalSong) => storage.exportMp3(song) });
}

/** Songs analysed by an older engine are re-analysed on this PC to get the improved chords. */
export const CURRENT_ENGINE = 'riffly-cpp-0.4';
export const needsReanalysis = (song: LocalSong) => localEngine.available() && !song.analysis.model_version.startsWith(CURRENT_ENGINE);

/** Re-run chord/tempo/strum analysis on the saved MP3; corrections and settings are kept. */
export function useReanalyse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const current = await storage.get(id);
      if (!current) throw new Error('This song is not on this device.');
      const bytes = await localEngine.readBytes(await storage.uploadSource(current));
      const analysis = await localEngine.analyze(bytes);
      const latest = (await storage.get(id)) ?? current; // settings may have changed meanwhile
      const next: LocalSong = { ...latest, analysis, updatedAt: new Date().toISOString() };
      await storage.put(next);
      return next;
    },
    onSuccess: (song) => {
      qc.setQueryData(songKeys.detail(id), song);
      void qc.invalidateQueries({ queryKey: songKeys.all, exact: true });
    },
  });
}
