import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TabView } from '@/components/music/TabView';
import { Button } from '@/components/ui/Button';
import { Card, Notice, ProgressBar } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { applyPatch, type LocalSong } from '@/features/library/model';
import { storage } from '@/features/library/storage';
import type { TabBar } from '@/lib/music/fingerstyle';
import { notesToBars, placeNotes } from '@/lib/music/placement';
import { api, uploadForTranscription } from '@/services/api';
import { spacing } from '@/theme/tokens';

import { songKeys } from '../hooks';

const POLL_MS = 2000;
// CPU source separation runs at roughly 2–4× the song's length.
const TIMEOUT_MS = 30 * 60 * 1000;

function useTranscribe(song: LocalSong) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<{ label: string; progress: number | null } | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      setPhase({ label: 'Uploading', progress: 0 });
      const source = await storage.uploadSource(song);
      const created = await uploadForTranscription(source, (p) => setPhase({ label: 'Uploading', progress: p })).promise;
      try {
        setPhase({ label: 'Separating the guitar and detecting notes. This takes a few minutes', progress: null });
        const deadline = Date.now() + TIMEOUT_MS;
        let job = created;
        while (job.status === 'processing') {
          if (Date.now() > deadline) throw new Error('Transcription is taking too long. Please try again.');
          await new Promise((r) => setTimeout(r, POLL_MS));
          job = await api.getTranscription(created.id);
        }
        if (job.status === 'failed' || !job.result) throw new Error(job.error ?? 'Transcription failed.');
        const current = (await storage.get(song.id)) ?? song;
        const next = applyPatch(current, { transcription: { ...job.result, created_at: new Date().toISOString() } });
        await storage.put(next);
        return next;
      } finally {
        void api.forgetTranscription(created.id);
      }
    },
    onSuccess: (next) => {
      qc.setQueryData(songKeys.detail(song.id), next);
    },
    onSettled: () => setPhase(null),
  });
  return { ...mutation, phase };
}

export function TranscribePanel({ song, capo, soundMidi, grid, current, onSeek }: { song: LocalSong; capo: number; soundMidi?: readonly number[]; grid: readonly TabBar[]; current: { bar: number; step: number } | null; onSeek: (t: number) => void }) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false, staleTime: 60_000 });
  const run = useTranscribe(song);
  const t = song.transcription;
  const placed = useMemo(() => (t ? placeNotes(t.notes, capo, 0.25, soundMidi) : []), [t, capo, soundMidi]);
  const bars = useMemo(() => (t ? notesToBars(placed, grid) : []), [t, placed, grid]);
  const dropped = t ? t.notes.length - placed.length : 0;
  const unavailable = health.data && health.data.transcription_available === false;

  return (
    <View style={{ gap: spacing.md }}>
      <Notice tone="warning">
        Experimental. Riffly isolates the guitar from the recording and detects the notes it plays. On busy band recordings it will miss notes and add wrong ones, so treat the result as a sketch to check by ear. The fingerpicking tab is the reliable option.
      </Notice>

      {run.phase ? (
        <Card style={styles.progress}>
          <ActivityIndicator />
          <Text variant="bodyStrong" align="center">{run.phase.label}…</Text>
          {run.phase.progress !== null && <ProgressBar progress={run.phase.progress} />}
          <Text variant="caption" tone="muted" align="center">You can keep practising. The song keeps playing.</Text>
        </Card>
      ) : (
        <View style={styles.row}>
          <Button
            label={t ? 'Transcribe again' : 'Transcribe this song'}
            icon="sparkles"
            variant={t ? 'secondary' : 'primary'}
            disabled={!!unavailable || health.isError}
            onPress={() => run.mutate()}
          />
          {t && <Text variant="caption" tone="muted">{t.notes.length} notes · {t.source.replace('-', ' ')} · {Math.round(t.processing_seconds)}s</Text>}
        </View>
      )}
      {unavailable && <Notice tone="info">Transcription isn't installed on this analysis server. Install backend/requirements-transcribe.txt to enable it (free, open source).</Notice>}
      {health.isError && <Notice tone="info">The analysis server isn't reachable. It's needed to transcribe.</Notice>}
      {run.isError && <Notice tone="error">{(run.error as Error).message}</Notice>}

      {t && (
        <>
          {capo > 0 && dropped > 0 && <Text variant="caption" tone="muted">{dropped} notes sit below the capo and are hidden. Set the capo to None to see them.</Text>}
          <TabView bars={bars} current={current} onSeek={onSeek} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
});
