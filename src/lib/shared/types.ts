/** Types shared between server modules and client components. No runtime imports allowed here. */

export const SECTION_IDS = ['books', 'newspapers', 'magazines', 'government', 'manuscripts'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && (SECTION_IDS as readonly string[]).includes(value);
}

/** An archive.org item or collection, cleaned for display. */
export interface ItemCard {
  identifier: string;
  title: string;
  isCollection: boolean;
  date?: string;
  year?: number;
  creator?: string;
  publisher?: string;
  itemCount?: number;
  downloads?: number;
  /** archive.org's `volume` field, when set. */
  volume?: string;
  thumbnail: string;
}

export type EbookAccess = 'public' | 'borrowable' | 'printdisabled' | 'no_ebook';

/** An Open Library work (one book, many scans). */
export interface WorkCard {
  workId: string; // e.g. "OL66554W"
  title: string;
  authors: { id: string; name: string }[];
  year?: number;
  cover?: string;
  access: EbookAccess;
  scanIds: string[];
}

export interface Page<T> {
  total: number;
  page: number;
  pageSize: number;
  results: T[];
  /** True when served from cache because the upstream was unreachable. */
  stale: boolean;
}

/** What the selection tray stores per item. Everything the download resolver needs to name files. */
export interface TrayItem {
  identifier: string;
  title: string;
  section: SectionId;
  publication?: string;
  year?: number;
  date?: string;
  thumbnail?: string;
}

export const FRIENDLY_FORMATS = ['pdf', 'epub', 'text', 'djvu', 'images'] as const;
export type FriendlyFormat = (typeof FRIENDLY_FORMATS)[number];

export const FORMAT_LABELS: Record<FriendlyFormat, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  text: 'Plain text',
  djvu: 'DjVu',
  images: 'Page images (ZIP)',
};

export type Fallback = 'skip' | 'pdf' | 'text';

export interface FormatAvailability {
  format: FriendlyFormat;
  available: number;
  bytes: number;
}

export interface FormatsResponse {
  total: number;
  restricted: string[];
  unavailable: string[]; // metadata could not be loaded
  /** Already in the download folder (any format). */
  downloaded: string[];
  formats: FormatAvailability[];
}

export const TASK_STATES = [
  'queued',
  'resolving',
  'downloading',
  'verifying',
  'done',
  'skipped',
  'failed',
  'cancelled',
] as const;
export type TaskState = (typeof TASK_STATES)[number];
export const TERMINAL_STATES: readonly TaskState[] = ['done', 'skipped', 'failed', 'cancelled'];

export interface TaskView {
  id: string;
  jobId: string;
  identifier: string;
  title: string;
  section: SectionId;
  fileName: string | null;
  destPath: string | null;
  state: TaskState;
  note: string | null;
  bytesDone: number;
  bytesTotal: number | null;
  attempts: number;
}

export interface JobView {
  id: string;
  createdAt: number;
  format: FriendlyFormat;
  fallback: Fallback;
  tasks: TaskView[];
}

export interface QueueStatus {
  paused: boolean;
  pauseReason: string | null;
}

export type DownloadEvent =
  | { type: 'snapshot'; jobs: JobView[]; queue: QueueStatus }
  | { type: 'task'; task: TaskView }
  | { type: 'job'; job: JobView }
  | { type: 'queue'; queue: QueueStatus };
