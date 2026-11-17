import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Notice, ProgressBar } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { config } from '@/config';
import { uploadSong, type UploadSource } from '@/services/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { songKeys } from './hooks';

const EXTENSIONS = ['.mp3', '.wav', '.m4a'];
const MAX_BYTES = config.maxUploadMb * 1024 * 1024;

/** Client-side pre-check; the server re-validates by magic bytes. */
export function validateFile(name: string, size: number | undefined): string | null {
  const lower = name.toLowerCase();
  if (!EXTENSIONS.some((e) => lower.endsWith(e))) return 'Unsupported format. Choose an MP3, WAV or M4A file.';
  if (size !== undefined && size > MAX_BYTES) return `That file is ${(size / 1048576).toFixed(0)} MB — the limit is ${config.maxUploadMb} MB.`;
  if (size === 0) return 'That file is empty.';
  return null;
}

type Phase = { kind: 'idle' } | { kind: 'uploading'; name: string; progress: number } | { kind: 'error'; message: string };

export function UploadPanel() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const dropRef = useRef<React.ComponentRef<typeof View>>(null);

  const start = async (source: UploadSource, size?: number) => {
    const invalid = validateFile(source.name, size);
    if (invalid) {
      setPhase({ kind: 'error', message: invalid });
      return;
    }
    setPhase({ kind: 'uploading', name: source.name, progress: 0 });
    const title = source.name.replace(/\.[^.]+$/, '');
    const { promise, abort } = uploadSong(source, { title }, (p) => setPhase({ kind: 'uploading', name: source.name, progress: p }));
    abortRef.current = abort;
    try {
      const song = await promise;
      void qc.invalidateQueries({ queryKey: songKeys.all });
      setPhase({ kind: 'idle' });
      router.push(`/song/${song.id}`);
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Upload failed.' });
    } finally {
      abortRef.current = null;
    }
  };

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' ? '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4' : ['audio/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (Platform.OS === 'web' && a.file) await start({ kind: 'web', file: a.file, name: a.name }, a.size);
    else await start({ kind: 'native', uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'audio/mpeg' }, a.size);
  };

  // Web-only drag and drop, attached to the underlying DOM node.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = dropRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void start({ kind: 'web', file, name: file.name }, file.size);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploading = phase.kind === 'uploading';
  return (
    <View
      ref={dropRef}
      style={[
        styles.zone,
        { borderColor: dragging ? colors.accent : colors.borderStrong, backgroundColor: dragging ? colors.accentSoft : colors.surface },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={uploading ? 'cloud-upload' : 'musical-notes'} size={28} color={colors.accent} />
      </View>
      {uploading ? (
        <View style={styles.progress}>
          <Text variant="subheading" numberOfLines={1}>Uploading {phase.name}</Text>
          <ProgressBar progress={phase.progress} />
          <Text variant="caption" tone="muted">{Math.round(phase.progress * 100)}% · analysis starts automatically</Text>
          <Button label="Cancel" variant="ghost" size="sm" onPress={() => abortRef.current?.()} />
        </View>
      ) : (
        <>
          <Text variant="heading" align="center">
            {Platform.OS === 'web' ? 'Drop a song here' : 'Choose a song to analyse'}
          </Text>
          <Text tone="muted" align="center">
            {config.supportedFormats.join(', ')} · up to {config.maxUploadMb} MB · up to 12 minutes
          </Text>
          <Button label={Platform.OS === 'web' ? 'Browse files' : 'Choose file'} icon="folder-open" onPress={pick} size="lg" />
        </>
      )}
      {phase.kind === 'error' && (
        <View style={{ alignSelf: 'stretch' }}>
          <Notice tone="error">{phase.message}</Notice>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  icon: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  progress: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, maxWidth: 420, width: '100%' },
});
