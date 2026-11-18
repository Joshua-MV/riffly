import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card, Notice } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { LocalSong } from '@/features/library/model';
import { storage } from '@/features/library/storage';
import { segmentsToLyrics, type Lyrics } from '@/lib/music/lyrics';
import { localEngine } from '@/services/localEngine';
import { lyricsEngine } from '@/services/lyricsEngine';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Phase = 'checking' | 'need-model' | 'downloading' | 'listening' | 'error';

/**
 * Gets the lyrics without the user typing them: Riffly listens to the song on this PC and
 * writes the words down with their times. The first time, the speech model is downloaded
 * (once, with the user's OK); after that it starts by itself.
 */
export function AutoLyrics({ song, onDone, onPaste }: { song: LocalSong; onDone: (l: Lyrics) => void; onPaste: () => void }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState(148_000_000);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const listen = async () => {
    setPhase('listening');
    setProgress(0);
    setError(null);
    try {
      const bytes = await localEngine.readBytes(await storage.uploadSource(song));
      const segments = await lyricsEngine.transcribe(bytes, (p) => setProgress(p / 100));
      const lyrics = segmentsToLyrics(segments);
      if (!lyrics.lines.length) throw new Error("Riffly couldn't hear any sung words in this recording.");
      onDone(lyrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const download = async () => {
    setPhase('downloading');
    setProgress(0);
    setError(null);
    try {
      await lyricsEngine.download((done, total) => setProgress(total ? done / total : 0));
      await listen();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void lyricsEngine
      .status()
      .then((s) => {
        setSize(s.bytes);
        if (s.present) void listen();
        else setPhase('need-model');
      })
      .catch((e) => {
        setError(String(e));
        setPhase('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mb = Math.round(size / 1e6);
  return (
    <Card style={{ gap: spacing.md }}>
      <View>
        <Text variant="subheading">Lyrics</Text>
        <Text variant="caption" tone="muted">
          Riffly listens to this recording on your PC and writes the words down, already timed to the song, with the chords above them. Nothing is uploaded.
        </Text>
      </View>

      {phase === 'checking' && <Text tone="muted">Getting ready…</Text>}

      {phase === 'need-model' && (
        <>
          <Notice tone="info">{`To hear the words, Riffly needs its speech model (${mb} MB, downloaded once from the open-source whisper.cpp project). After that, lyrics work offline for every song.`}</Notice>
          <View style={styles.row}>
            <Button label={`Download (${mb} MB) and get the lyrics`} icon="download-outline" onPress={() => void download()} />
            <Button label="Paste lyrics instead" variant="ghost" onPress={onPaste} />
          </View>
        </>
      )}

      {(phase === 'downloading' || phase === 'listening') && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodyStrong">
            {phase === 'downloading' ? `Downloading the speech model… ${Math.round(progress * mb)} / ${mb} MB` : `Listening to the song… ${Math.round(progress * 100)}%`}
          </Text>
          <Bar value={progress} />
          <Text variant="caption" tone="muted">
            {phase === 'listening' ? 'This takes about a minute for a 4-minute song. You can keep playing while it works.' : 'This only happens once.'}
          </Text>
        </View>
      )}

      {phase === 'error' && (
        <>
          <Notice tone="error">{error ?? 'Something went wrong.'}</Notice>
          <View style={styles.row}>
            <Button label="Try again" icon="refresh" onPress={() => void (size && error?.includes('model') ? download() : listen())} />
            <Button label="Paste lyrics instead" variant="ghost" onPress={onPaste} />
          </View>
        </>
      )}
    </Card>
  );
}

function Bar({ value }: { value: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
      <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, value * 100))}%`, backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  track: { height: 10, borderRadius: radius.pill, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
