/**
 * Public runtime configuration (EXPO_PUBLIC_* variables are inlined at build time and are
 * visible to users — never put secrets here).
 */
import { Platform } from 'react-native';

function defaultApiUrl(): string {
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
