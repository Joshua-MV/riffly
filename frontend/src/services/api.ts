/**
 * Client for the stateless Riffly analysis server (backend/app/routers/analyses.py).
 * The server keeps nothing: the app uploads a song, polls for the result, downloads the
 * MP3, saves everything on the device, then tells the server to forget the job.
 */

import { config } from '@/config';

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
  /** Strumming detected from the recording (on-device engine 0.2+). */
  strum?: StrumAnalysis;
}

export interface StrumAnalysis {
  /** Eight eighth notes of a 4/4 bar: D down, U up, - rest. */
  pattern: string;
  /** Beat index (mod 4) that starts a bar, in the engine's own beat list. */
  downbeat: number;
  sixteenth_feel: boolean;
  confidence: number;
  sixteenths: number[];
}

export type JobStatus = 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  title: string;
  original_filename: string;
  status: JobStatus;
  error: string | null;
  result: AnalysisResult | null;
  audio_url: string | null;
  audio_bytes: number | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const unreachable = () => new ApiError(0, `Can't reach the Riffly analysis server at ${config.apiUrl}. Is it running?`);

function authHeaders(): Record<string, string> {
  return config.apiKey ? { 'X-API-Key': config.apiKey } : {};
}

async function errorFrom(res: Response): Promise<ApiError> {
  let detail = res.statusText || `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') detail = body.detail;
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, detail);
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path.startsWith('http') ? path : `${config.apiUrl}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers ?? {}) },
    });
  } catch {
    throw unreachable();
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

export interface TranscriptionJob {
  id: string;
  status: JobStatus;
  error: string | null;
  result: { notes: { start: number; end: number; midi: number; velocity: number }[]; source: string; model_version: string; processing_seconds: number } | null;
}

export const api = {
  health: async () =>
    (await send('/api/health')).json() as Promise<{ status: string; engine: string; transcription_available?: boolean }>,
  getTranscription: async (id: string) => (await send(`/api/transcriptions/${id}`)).json() as Promise<TranscriptionJob>,
  forgetTranscription: async (id: string) => {
    try {
      await send(`/api/transcriptions/${id}`, { method: 'DELETE' });
    } catch {
      /* expires on its own */
    }
  },
  getJob: async (id: string) => (await send(`/api/analyses/${id}`)).json() as Promise<Job>,
  /** Download the MP3 the server produced. */
  downloadAudio: async (url: string) => (await send(url)).arrayBuffer(),
  /** Tell the server to delete the job's files. Failure is harmless: jobs expire anyway. */
  forgetJob: async (id: string) => {
    try {
      await send(`/api/analyses/${id}`, { method: 'DELETE' });
    } catch {
      /* expires on its own */
    }
  },
};

/** A file chosen by the user: a web File, or a native file URI. */
export type UploadSource =
  | { kind: 'web'; file: Blob; name: string }
  | { kind: 'native'; uri: string; name: string; mimeType: string };

/** Multipart upload with progress (XHR is the only cross-platform API with upload progress). */
export function uploadForAnalysis(
  source: UploadSource,
  title: string,
  onProgress: (fraction: number) => void,
): { promise: Promise<Job>; abort: () => void } {
  return uploadTo<Job>('/api/analyses', source, { title }, onProgress);
}

export function uploadForTranscription(source: UploadSource, onProgress: (fraction: number) => void) {
  return uploadTo<TranscriptionJob>('/api/transcriptions', source, {}, onProgress);
}

function uploadTo<T>(
  path: string,
  source: UploadSource,
  fields: Record<string, string>,
  onProgress: (fraction: number) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    const form = new FormData();
    if (source.kind === 'web') form.append('file', source.file, source.name);
    else form.append('file', { uri: source.uri, name: source.name, type: source.mimeType } as unknown as Blob);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    xhr.open('POST', `${config.apiUrl}${path}`);
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, (body as { detail?: string } | null)?.detail ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(unreachable());
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
