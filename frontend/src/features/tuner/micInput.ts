import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

import { HOP, MicPermissionError, WINDOW, type FrameHandler, type MicInput } from './micInput.types';

/**
 * iOS/Android microphone via expo-audio's real-time PCM stream. The OS decides the input
 * device: built-in mic, headset, or a USB/Lightning audio interface. Buffers arrive in
 * arbitrary sizes, so they are collected into a sliding WINDOW and analysed every HOP samples.
 */
export function useMicInput(onFrame: FrameHandler): MicInput {
  const handler = useRef(onFrame);
  handler.current = onFrame;
  const ring = useRef(new Float32Array(WINDOW));
  const frame = useRef(new Float32Array(WINDOW));
  const filled = useRef(0);
  const sinceLast = useRef(0);

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    const samples = new Float32Array(buffer.data);
    const channels = buffer.channels || 1;
    const r = ring.current;
    const n = Math.floor(samples.length / channels);
    const keep = Math.min(n, WINDOW);
    const skip = n - keep;
    // Shift the window once per buffer, then append the downmixed samples.
    if (keep < WINDOW) r.copyWithin(0, keep);
    for (let i = 0; i < keep; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += samples[(skip + i) * channels + c];
      r[WINDOW - keep + i] = v / channels;
    }
    filled.current = Math.min(WINDOW, filled.current + n);
    sinceLast.current += n;
    if (filled.current < WINDOW || sinceLast.current < HOP) return;
    sinceLast.current = 0;
    frame.current.set(r);
    handler.current(frame.current, buffer.sampleRate);
  }, []);

  const { stream } = useAudioStream({ sampleRate: 48000, channels: 1, encoding: 'float32', onBuffer });

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) throw new MicPermissionError('Microphone permission denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    filled.current = 0;
    sinceLast.current = 0;
    await stream.start();
  }, [stream]);

  const stop = useCallback(() => {
    try {
      stream.stop();
    } catch {
      // Already stopped.
    }
  }, [stream]);

  useEffect(() => stop, [stop]);
  return { start, stop };
}
