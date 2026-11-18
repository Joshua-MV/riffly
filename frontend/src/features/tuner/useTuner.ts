import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { tuningStrings, type Tuning } from '@/lib/music/instruments';
import { TunerEngine, type TunerReading } from '@/lib/music/tuner';

import { useMicInput } from './micInput';
import { MicPermissionError } from './micInput.types';

export type TunerStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'error';

/**
 * Microphone frames → TunerEngine (YIN) → readings. All processing happens on-device;
 * no audio is recorded or sent anywhere.
 */
export function useTuner(tuning: Tuning, selectedString: number | null, a4 = 440) {
  const [status, setStatus] = useState<TunerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);
  /** Microphone input level in dBFS (about 10 updates a second), or null when stopped. */
  const [levelDb, setLevelDb] = useState<number | null>(null);
  const lastLevel = useRef(0);

  const strings = useMemo(() => tuningStrings(tuning, a4), [tuning, a4]);
  const engineRef = useRef<{ engine: TunerEngine; sampleRate: number } | null>(null);
  const lastHeard = useRef(0);

  // Any settings change invalidates the engine; it is rebuilt lazily on the next frame.
  useEffect(() => {
    engineRef.current = null;
  }, [a4, strings, selectedString, tuning.spelling]);

  const onFrame = useCallback(
    (frame: Float32Array, sampleRate: number) => {
      if (!engineRef.current || engineRef.current.sampleRate !== sampleRate) {
        engineRef.current = {
          sampleRate,
          engine: new TunerEngine({ sampleRate, a4, strings, selectedString, spelling: tuning.spelling }),
        };
      }
      const now = Date.now();
      if (now - lastLevel.current > 100) {
        lastLevel.current = now;
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        const rms = Math.sqrt(sum / Math.max(1, frame.length));
        setLevelDb(rms > 1e-6 ? Math.max(-80, 20 * Math.log10(rms)) : -80);
      }
      const result = engineRef.current.engine.process(frame, now);
      if (result) {
        lastHeard.current = now;
        setReading(result);
      } else if (now - lastHeard.current > 1500) {
        // Keep the last note briefly so the display doesn't flicker between plucks.
        setReading((r) => (r ? null : r));
      }
    },
    [a4, strings, selectedString, tuning.spelling],
  );

  const mic = useMicInput(onFrame);

  const start = useCallback(async () => {
    setError(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext) {
      setStatus('unsupported');
      setError('Browsers only allow microphone access on https:// or localhost.');
      return;
    }
    setStatus('requesting');
    try {
      await mic.start();
      setStatus('listening');
    } catch (e) {
      if (e instanceof MicPermissionError) setStatus('denied');
      else {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Could not start the microphone.');
      }
    }
  }, [mic]);

  const stop = useCallback(() => {
    mic.stop();
    setStatus('idle');
    setReading(null);
    setLevelDb(null);
  }, [mic]);

  return { status, error, reading, levelDb, strings, start, stop };
}
