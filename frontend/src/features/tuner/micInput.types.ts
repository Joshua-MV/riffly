/** Analysis window delivered to the tuner: ≥ 2 periods of D2 (73 Hz) at 48 kHz. */
export const WINDOW = 4096;
/** New samples between analyses (~47 analyses per second at 48 kHz). */
export const HOP = 1024;

export type FrameHandler = (frame: Float32Array, sampleRate: number) => void;

export class MicPermissionError extends Error {}

export interface MicInput {
  /** Requests permission if needed and starts delivering frames. */
  start: () => Promise<void>;
  stop: () => void;
}
