/** Typed client for the Riffly FastAPI backend. Mirrors backend/app/schemas.py. */

import { config } from '@/config';

export type AnalysisStatus = 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';

export interface ChordSegment {
  start: number;
  end: number;
  label: string;
  root: number | null;
  quality: string | null;
  confidence: number;
}

export interface AnalysisResult {
  duration: number;
  key: string | null;
  key_confidence: number | null;
  bpm: number | null;
  bpm_confidence: number | null;
  chords: ChordSegment[];
  progression: string[];
  beats: number[];
  waveform: number[];
  model_version: string;
  processing_seconds: number;
  notes: string[];
}

export interface Analysis {
  id: string;
  song_id: string;
  status: AnalysisStatus;
  error: string | null;
  model_version: string | null;
  created_at: string;
  completed_at: string | null;
  result: AnalysisResult | null;
}

export interface Correction {
  id: string;
  analysis_id: string;
  start: number;
  original_label: string;
  corrected_label: string;
  created_at: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  duration: number | null;
  is_favourite: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  status: AnalysisStatus;
  key: string | null;
  bpm: number | null;
}

export interface SongDetail extends Song {
  audio_url: string;
  analysis: Analysis | null;
  corrections: Correction[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, `Can't reach the Riffly server at ${config.apiUrl}. Is the backend running?`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  listSongs: () => request<Song[]>('/api/songs'),
  getSong: (id: string) => request<SongDetail>(`/api/songs/${id}`),
  updateSong: (id: string, body: Partial<Pick<Song, 'title' | 'artist' | 'notes' | 'is_favourite'>>) =>
    request<SongDetail>(`/api/songs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSong: (id: string) => request<void>(`/api/songs/${id}`, { method: 'DELETE' }),
  reanalyze: (id: string) => request<Analysis>(`/api/songs/${id}/analyze`, { method: 'POST' }),
  correctChord: (id: string, body: { start: number; original_label: string; corrected_label: string }) =>
    request<Correction>(`/api/songs/${id}/corrections`, { method: 'PUT', body: JSON.stringify(body) }),
  revertCorrection: (songId: string, correctionId: string) =>
    request<void>(`/api/songs/${songId}/corrections/${correctionId}`, { method: 'DELETE' }),
  health: () => request<{ status: string; engine: string }>('/api/health'),
};

/** A file chosen by the user: a web File, or a native file URI. */
export type UploadSource =
  | { kind: 'web'; file: Blob; name: string }
  | { kind: 'native'; uri: string; name: string; mimeType: string };

/** Multipart upload with progress (XHR is the only cross-platform API with upload progress). */
export function uploadSong(
  source: UploadSource,
  fields: { title?: string },
  onProgress: (fraction: number) => void,
): { promise: Promise<SongDetail>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<SongDetail>((resolve, reject) => {
    const form = new FormData();
    if (source.kind === 'web') form.append('file', source.file, source.name);
    else form.append('file', { uri: source.uri, name: source.name, type: source.mimeType } as unknown as Blob);
    if (fields.title) form.append('title', fields.title);
    xhr.open('POST', `${config.apiUrl}/api/songs`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as SongDetail);
      else reject(new ApiError(xhr.status, (body as { detail?: string } | null)?.detail ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, `Can't reach the Riffly server at ${config.apiUrl}. Is the backend running?`));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
