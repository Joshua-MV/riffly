import { useCallback, useEffect, useRef } from 'react';

import { HOP, MicPermissionError, WINDOW, type FrameHandler, type MicInput } from './micInput.types';

/**
 * Browser microphone via the Web Audio API. An AnalyserNode keeps the latest WINDOW
 * samples; we read it every HOP samples' worth of time. Browser voice processing (echo
 * cancellation, noise suppression, auto gain) is disabled because it distorts pitch.
 */
export function useMicInput(onFrame: FrameHandler): MicInput {
  const handler = useRef(onFrame);
  handler.current = onFrame;
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone input.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicPermissionError('Microphone permission denied');
      if (name === 'NotFoundError') throw new Error('No microphone was found. Connect one and try again.');
      throw e;
    }
    const ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = WINDOW;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    const frame = new Float32Array(WINDOW);
    streamRef.current = stream;
    ctxRef.current = ctx;
    timerRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(frame);
      handler.current(frame, ctx.sampleRate);
    }, (HOP / ctx.sampleRate) * 1000);
  }, []);

  useEffect(() => stop, [stop]);
  return { start, stop };
}
