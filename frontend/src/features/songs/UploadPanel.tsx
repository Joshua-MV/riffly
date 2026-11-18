import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { config } from '@/config';
import { startImport } from '@/features/library/importer';
import type { UploadSource } from '@/services/api';
import { localEngine } from '@/services/localEngine';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { songKeys } from './hooks';

const EXTENSIONS = ['.mp3', '.wav', '.m4a'];
const MAX_BYTES = config.maxUploadMb * 1024 * 1024;

/** Client-side pre-check; the engine re-validates by magic bytes. */
export function validateFile(name: string, size: number | undefined): string | null {
  const lower = name.toLowerCase();
  if (!EXTENSIONS.some((e) => lower.endsWith(e))) return 'Unsupported format. Choose an MP3, WAV or M4A file.';
  if (size !== undefined && size > MAX_BYTES) return `That file is ${(size / 1048576).toFixed(0)} MB — the limit is ${config.maxUploadMb} MB.`;
  if (size === 0) return 'That file is empty.';
  return null;
}

/**
 * Importing songs: a file picker plus drag-and-drop anywhere in the window (Windows app).
 * Progress shows in the ImportList.
 */
export function useSongImport() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const start = (source: UploadSource, size?: number) => {
    const invalid = validateFile(source.name, size);
    setError(invalid);
    if (invalid) return;
    startImport(source, () => void qc.invalidateQueries({ queryKey: songKeys.all }));
  };
  const startRef = useRef(start);
  startRef.current = start;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' ? '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4' : ['audio/*'],
      copyToCacheDirectory: true,
      multiple: Platform.OS === 'web',
    });
    if (res.canceled || !res.assets?.length) return;
    for (const a of res.assets) {
      if (Platform.OS === 'web' && a.file) start({ kind: 'web', file: a.file, name: a.name }, a.size);
      else start({ kind: 'native', uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'audio/mpeg' }, a.size);
    }
  };

  // Drop anywhere in the window.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      for (const file of [...(e.dataTransfer?.files ?? [])]) startRef.current({ kind: 'web', file, name: file.name }, file.size);
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  return { pick, error, dragging, clearError: () => setError(null) };
}

/** The slim drop panel on My Songs. */
export function DropZone({ onPick, dragging }: { onPick: () => void; dragging: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel="Import audio: drop MP3 or WAV files, or choose files"
      onPress={onPick}
      style={({ hovered }: PressState) => [
        styles.zone,
        { borderColor: dragging ? colors.accent : colors.border, backgroundColor: dragging ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <Icon name="download-outline" size={18} color={colors.highlight} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading">{dragging ? 'Drop to import' : Platform.OS === 'web' ? 'Drop MP3 or WAV files anywhere in this window' : 'Choose songs to import'}</Text>
        <Text variant="caption" tone="muted">
          {localEngine.available()
            ? 'Riffly finds the key, tempo, chords, beats and strumming on your computer. Files never leave this machine.'
            : `${config.supportedFormats.join(', ')} · up to ${config.maxUploadMb} MB · saved on this device as MP3.`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', flex: 1, minWidth: 280 },
  icon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
