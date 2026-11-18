export interface ClickScheduler {
  /** Play one click `delaySeconds` from now (accent = beat 1 of the bar). */
  click(delaySeconds: number, accent: boolean, volume: number): void;
  dispose(): void;
}
