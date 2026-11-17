import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { config } from '@/config';
import { startImport } from '@/features/library/importer';
import type { UploadSource } from '@/services/api';
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

export function UploadPanel() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef<React.ComponentRef<typeof View>>(null);

  const start = (source: UploadSource, size?: number) => {
    const invalid = validateFile(source.name, size);
    setError(invalid);
    if (invalid) return;
    // Progress and an "Open" button appear in the ImportList on this and the My Music screen.
    startImport(source, () => void qc.invalidateQueries({ queryKey: songKeys.all }));
  };
  const startRef = useRef(start);
  startRef.current = start;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' ? '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4' : ['audio/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (Platform.OS === 'web' && a.file) start({ kind: 'web', file: a.file, name: a.name }, a.size);
    else start({ kind: 'native', uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'audio/mpeg' }, a.size);
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
      if (file) startRef.current({ kind: 'web', file, name: file.name }, file.size);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <View
      ref={dropRef}
      style={[
        styles.zone,
        { borderColor: dragging ? colors.accent : colors.borderStrong, backgroundColor: dragging ? colors.accentSoft : colors.surface },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="musical-notes" size={28} color={colors.accent} />
      </View>
      <Text variant="heading" align="center">
        {Platform.OS === 'web' ? 'Drop a song here' : 'Choose a song to analyse'}
      </Text>
      <Text tone="muted" align="center">
        {config.supportedFormats.join(', ')} · up to {config.maxUploadMb} MB · up to 12 minutes
      </Text>
      <Button label={Platform.OS === 'web' ? 'Browse files' : 'Choose file'} icon="folder-open" onPress={pick} size="lg" />
      <Text variant="caption" tone="subtle" align="center">
        Saved on this device as MP3. The analysis server deletes its copy as soon as it's done.
      </Text>
      {error && (
        <View style={{ alignSelf: 'stretch' }}>
          <Notice tone="error">{error}</Notice>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg, padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  icon: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
