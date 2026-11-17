/**
 * Public runtime configuration (EXPO_PUBLIC_* variables are inlined at build time and are
 * visible to users — never put secrets here).
 */
import { Platform } from 'react-native';

function defaultApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // `npm start` serves the app from the analysis server itself: same origin.
    // `npm run dev` serves it from the Expo dev server on 8081, next to the API on 8000.
    return window.location.port === '8081' ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin;
  }
  // Android emulators reach the host machine via 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl()).replace(/\/$/, ''),
  /** Optional key for a shared analysis server. It ships inside the app, so it only deters casual misuse. */
  apiKey: process.env.EXPO_PUBLIC_API_KEY || null,
  maxUploadMb: 50,
  supportedFormats: ['MP3', 'WAV', 'M4A'] as const,
};
