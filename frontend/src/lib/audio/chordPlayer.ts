import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { voicingMidiNotes, type Frets } from '@/lib/music/voicings';

import { encodeWav, renderStrum } from './pluck';

const uriCache = new Map<string, string>();
let player: AudioPlayer | null = null;

/** Synthesize a strum (cached per voicing) and return a playable URI. */
function strumUri(frets: Frets): string {
  const key = frets.map((f) => (f === null ? 'x' : f)).join('-');
  const cached = uriCache.get(key);
  if (cached) return cached;
  const wav = encodeWav(renderStrum(voicingMidiNotes(frets)));
  let uri: string;
  if (Platform.OS === 'web') {
    uri = URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' }));
  } else {
    const file = new File(Paths.cache, `strum-${key}.wav`);
    if (!file.exists) file.write(wav);
    uri = file.uri;
  }
  uriCache.set(key, uri);
  return uri;
}

/** Play a voicing as a synthesized guitar strum. */
export function playVoicing(frets: Frets): void {
  const uri = strumUri(frets);
  if (!player) player = createAudioPlayer({ uri });
  else player.replace({ uri });
  void player.seekTo(0).finally(() => player?.play());
}
