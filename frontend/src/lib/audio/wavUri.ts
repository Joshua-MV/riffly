import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const cache = new Map<string, string>();

/** Make generated WAV bytes playable: a Blob URL on web, a cached file on iOS/Android. */
export async function wavUri(wav: Uint8Array, name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  let uri: string;
  if (Platform.OS === 'web') {
    uri = URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' }));
  } else {
    const file = new File(Paths.cache, `${name}.wav`);
    if (!file.exists) await file.write(wav);
    uri = file.uri;
  }
  cache.set(name, uri);
  return uri;
}
