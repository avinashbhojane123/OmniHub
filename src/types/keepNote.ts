export type KeepNoteType = 'text' | 'checklist' | 'drawing' | 'audio' | 'image';

export const KEEP_NOTE_TYPES: readonly KeepNoteType[] = [
  'text',
  'checklist',
  'drawing',
  'audio',
  'image',
] as const;

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
  indent?: number; // 0, 1, 2 for nested hierarchy
}

export interface DrawingPoint {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
}

export interface DrawingStroke {
  color: string;
  width: number;
  points: DrawingPoint[];
  opacity?: number;
  cap?: 'round' | 'butt' | 'square';
}

export type KeepColorKey =
  | 'default'
  | 'coral'
  | 'peach'
  | 'sand'
  | 'mint'
  | 'sage'
  | 'fog'
  | 'storm'
  | 'dusk'
  | 'blossom'
  | 'clay'
  | 'chalk';

export const KEEP_COLOR_KEYS: readonly KeepColorKey[] = [
  'default',
  'coral',
  'peach',
  'sand',
  'mint',
  'sage',
  'fog',
  'storm',
  'dusk',
  'blossom',
  'clay',
  'chalk',
] as const;

export interface KeepColorDef {
  key: KeepColorKey;
  name: string;
  lightBg: string;
  lightBorder: string;
  lightText: string;
  darkBg: string;
  darkBorder: string;
  darkText: string;
}

export const KEEP_COLORS: Record<KeepColorKey, KeepColorDef> = {
  default: {
    key: 'default',
    name: 'Default',
    lightBg: '#FFFFFF',
    lightBorder: '#E2E8F0',
    lightText: '#0F172A',
    darkBg: '#1E293B',
    darkBorder: '#334155',
    darkText: '#F8FAFC',
  },
  coral: {
    key: 'coral',
    name: 'Coral',
    lightBg: '#FEE2E2',
    lightBorder: '#FECACA',
    lightText: '#7F1D1D',
    darkBg: '#451A1A',
    darkBorder: '#7F1D1D',
    darkText: '#FEE2E2',
  },
  peach: {
    key: 'peach',
    name: 'Peach',
    lightBg: '#FFEDD5',
    lightBorder: '#FED7AA',
    lightText: '#7C2D12',
    darkBg: '#431407',
    darkBorder: '#7C2D12',
    darkText: '#FFEDD5',
  },
  sand: {
    key: 'sand',
    name: 'Sand',
    lightBg: '#FEF9C3',
    lightBorder: '#FEF08A',
    lightText: '#713F12',
    darkBg: '#3F3507',
    darkBorder: '#713F12',
    darkText: '#FEF9C3',
  },
  mint: {
    key: 'mint',
    name: 'Mint',
    lightBg: '#DCFCE7',
    lightBorder: '#BBF7D0',
    lightText: '#14532D',
    darkBg: '#143823',
    darkBorder: '#14532D',
    darkText: '#DCFCE7',
  },
  sage: {
    key: 'sage',
    name: 'Sage',
    lightBg: '#CCFBF1',
    lightBorder: '#99F6E4',
    lightText: '#115E59',
    darkBg: '#133534',
    darkBorder: '#115E59',
    darkText: '#CCFBF1',
  },
  fog: {
    key: 'fog',
    name: 'Fog',
    lightBg: '#E0F2FE',
    lightBorder: '#BAE6FD',
    lightText: '#075985',
    darkBg: '#0C2D48',
    darkBorder: '#075985',
    darkText: '#E0F2FE',
  },
  storm: {
    key: 'storm',
    name: 'Storm',
    lightBg: '#DBEAFE',
    lightBorder: '#BFDBFE',
    lightText: '#1E40AF',
    darkBg: '#172554',
    darkBorder: '#1E40AF',
    darkText: '#DBEAFE',
  },
  dusk: {
    key: 'dusk',
    name: 'Dusk',
    lightBg: '#F3E8FF',
    lightBorder: '#E9D5FF',
    lightText: '#581C87',
    darkBg: '#31104D',
    darkBorder: '#581C87',
    darkText: '#F3E8FF',
  },
  blossom: {
    key: 'blossom',
    name: 'Blossom',
    lightBg: '#FCE7F3',
    lightBorder: '#FBCFE8',
    lightText: '#831843',
    darkBg: '#4A1135',
    darkBorder: '#831843',
    darkText: '#FCE7F3',
  },
  clay: {
    key: 'clay',
    name: 'Clay',
    lightBg: '#F5EBE1',
    lightBorder: '#E6D7C3',
    lightText: '#543D2B',
    darkBg: '#38281D',
    darkBorder: '#543D2B',
    darkText: '#F5EBE1',
  },
  chalk: {
    key: 'chalk',
    name: 'Chalk',
    lightBg: '#F1F5F9',
    lightBorder: '#E2E8F0',
    lightText: '#1E293B',
    darkBg: '#242B35',
    darkBorder: '#3F4957',
    darkText: '#F1F5F9',
  },
};

export interface ResolvedKeepColor {
  key: KeepColorKey;
  name: string;
  bg: string;
  border: string;
  text: string;
}

export interface KeepNote {
  id: string;
  title: string;
  content: string;
  type: KeepNoteType;
  color: KeepColorKey;
  isPinned: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  trashedAt?: string;
  reminderTime?: string; // ISO string
  labels: string[]; // array of label names
  checklistData: ChecklistItem[];
  drawingData?: DrawingStroke[];
  audioUri?: string;
  imageUri?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface CreateKeepNoteDTO {
  id?: string;
  title?: string;
  content?: string;
  type?: KeepNoteType;
  color?: KeepColorKey;
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  trashedAt?: string | null;
  reminderTime?: string | null;
  labels?: string[];
  checklistData?: ChecklistItem[];
  drawingData?: DrawingStroke[];
  audioUri?: string | null;
  imageUri?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateKeepNoteDTO {
  title?: string;
  content?: string;
  type?: KeepNoteType;
  color?: KeepColorKey;
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  trashedAt?: string | null;
  reminderTime?: string | null;
  labels?: string[];
  checklistData?: ChecklistItem[];
  drawingData?: DrawingStroke[];
  audioUri?: string | null;
  imageUri?: string | null;
  updatedAt?: string;
}

export interface KeepNoteFilter {
  status?: 'active' | 'archived' | 'trash' | 'reminders';
  search?: string;
  label?: string;
  color?: KeepColorKey;
}

export type KeepFilterTab = 'all' | 'reminders' | 'checklists' | 'archived' | 'trash';
export type KeepNoteViewMode = 'grid' | 'list';

export interface KeepNoteStats {
  totalChecklistItems: number;
  completedChecklistItems: number;
  pendingChecklistItems: number;
  checklistProgress: number; // 0 to 100 integer percentage
  hasReminder: boolean;
  isReminderOverdue: boolean;
  wordCount: number;
  characterCount: number;
  labelsCount: number;
  hasDrawing: boolean;
  hasAudio: boolean;
  hasImage: boolean;
  isPinned: boolean;
  isArchived: boolean;
  isTrashed: boolean;
}

export interface ChecklistFormatOptions {
  format?: 'bullet' | 'markdown' | 'plain';
}

// Runtime Type Guards

export function isKeepColorKey(value: unknown): value is KeepColorKey {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return (KEEP_COLOR_KEYS as readonly string[]).includes(normalized);
}

export function isKeepNoteType(value: unknown): value is KeepNoteType {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return (KEEP_NOTE_TYPES as readonly string[]).includes(normalized);
}

export function isDrawingPoint(value: unknown): value is DrawingPoint {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.x === 'number' &&
    !Number.isNaN(c.x) &&
    typeof c.y === 'number' &&
    !Number.isNaN(c.y) &&
    (c.pressure === undefined || (typeof c.pressure === 'number' && !Number.isNaN(c.pressure))) &&
    (c.timestamp === undefined || (typeof c.timestamp === 'number' && !Number.isNaN(c.timestamp)))
  );
}

export function isDrawingStroke(value: unknown): value is DrawingStroke {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.color === 'string' &&
    typeof c.width === 'number' &&
    !Number.isNaN(c.width) &&
    Array.isArray(c.points) &&
    c.points.every(isDrawingPoint) &&
    (c.opacity === undefined || (typeof c.opacity === 'number' && !Number.isNaN(c.opacity))) &&
    (c.cap === undefined || ['round', 'butt', 'square'].includes(c.cap as string))
  );
}

export function isChecklistItem(value: unknown): value is ChecklistItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.completed === 'boolean' &&
    (candidate.order === undefined || typeof candidate.order === 'number') &&
    (candidate.indent === undefined || typeof candidate.indent === 'number')
  );
}

export function isKeepNote(value: unknown): value is KeepNote {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.content === 'string' &&
    isKeepNoteType(c.type) &&
    isKeepColorKey(c.color) &&
    typeof c.isPinned === 'boolean' &&
    typeof c.isArchived === 'boolean' &&
    typeof c.isTrashed === 'boolean' &&
    Array.isArray(c.labels) &&
    c.labels.every((l) => typeof l === 'string') &&
    Array.isArray(c.checklistData) &&
    c.checklistData.every(isChecklistItem) &&
    typeof c.createdAt === 'string' &&
    typeof c.updatedAt === 'string' &&
    (c.trashedAt === undefined || c.trashedAt === null || typeof c.trashedAt === 'string') &&
    (c.reminderTime === undefined || c.reminderTime === null || typeof c.reminderTime === 'string') &&
    (c.drawingData === undefined ||
      c.drawingData === null ||
      (Array.isArray(c.drawingData) && c.drawingData.every(isDrawingStroke))) &&
    (c.audioUri === undefined || c.audioUri === null || typeof c.audioUri === 'string') &&
    (c.imageUri === undefined || c.imageUri === null || typeof c.imageUri === 'string')
  );
}

// Color Resolvers

export function getKeepColor(colorKey?: string | null): KeepColorDef {
  if (colorKey) {
    const normalized = colorKey.trim().toLowerCase() as KeepColorKey;
    if (isKeepColorKey(normalized)) {
      return KEEP_COLORS[normalized];
    }
  }
  return KEEP_COLORS.default;
}

export function resolveKeepColor(colorKey?: string | null, isDark = false): ResolvedKeepColor {
  const def = getKeepColor(colorKey);
  return {
    key: def.key,
    name: def.name,
    bg: isDark ? def.darkBg : def.lightBg,
    border: isDark ? def.darkBorder : def.lightBorder,
    text: isDark ? def.darkText : def.lightText,
  };
}

// Factory Helper

export function createEmptyKeepNote(overrides: Partial<KeepNote> = {}): KeepNote {
  const now = new Date().toISOString();
  const uniqueId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    id: overrides.id || uniqueId,
    title: overrides.title || '',
    content: overrides.content || '',
    type: overrides.type || 'text',
    color: overrides.color && isKeepColorKey(overrides.color) ? overrides.color : 'default',
    isPinned: Boolean(overrides.isPinned),
    isArchived: Boolean(overrides.isArchived),
    isTrashed: Boolean(overrides.isTrashed),
    trashedAt: overrides.trashedAt || undefined,
    reminderTime: overrides.reminderTime || undefined,
    labels: Array.isArray(overrides.labels) ? [...overrides.labels] : [],
    checklistData: Array.isArray(overrides.checklistData)
      ? overrides.checklistData.map((item) => ({ ...item }))
      : [],
    drawingData: Array.isArray(overrides.drawingData)
      ? overrides.drawingData.map((stroke) => ({
          ...stroke,
          points: Array.isArray(stroke.points) ? stroke.points.map((pt) => ({ ...pt })) : [],
        }))
      : undefined,
    audioUri: overrides.audioUri || undefined,
    imageUri: overrides.imageUri || undefined,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

// Checklist & Text Converters

export function checklistToText(
  items: ChecklistItem[] | undefined | null,
  options?: ChecklistFormatOptions
): string {
  if (!items || items.length === 0) return '';
  const fmt = options?.format || 'bullet';

  return items
    .filter((item) => item.text.trim().length > 0)
    .map((item) => {
      const indent = item.indent && item.indent > 0 ? '  '.repeat(item.indent) : '';
      if (fmt === 'markdown') {
        return `${indent}${item.completed ? '[x]' : '[ ]'} ${item.text.trim()}`;
      }
      if (fmt === 'plain') {
        return `${indent}${item.text.trim()}`;
      }
      // 'bullet' format (default)
      return `${indent}${item.completed ? '✓' : '•'} ${item.text.trim()}`;
    })
    .join('\n');
}

export function textToChecklist(text: string | undefined | null): ChecklistItem[] {
  if (!text || text.trim().length === 0) {
    const seed = Math.random().toString(36).substring(2, 6);
    return [{ id: `item_${Date.now()}_1_${seed}`, text: '', completed: false, order: 1 }];
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    const seed = Math.random().toString(36).substring(2, 6);
    return [{ id: `item_${Date.now()}_1_${seed}`, text: '', completed: false, order: 1 }];
  }

  return lines.map((line, idx) => {
    const match = line.match(/^(\s*)(?:\[([ xXvV✓✔☑])\]|([✓✔☑])|[•\-*○◦▪▫+]|\d+[\.\)])\s*(.*)$/);
    let completed = false;
    let itemText = line.trim();
    let indent = 0;

    if (match) {
      const leadingSpaces = match[1] || '';
      indent = Math.floor(leadingSpaces.length / 2);
      if (match[2]) {
        const mark = match[2].toLowerCase();
        completed = mark === 'x' || mark === 'v' || mark === '✓' || mark === '✔' || mark === '☑';
      } else if (match[3]) {
        completed = true;
      }
      itemText = (match[4] !== undefined ? match[4] : '').trim();
    } else {
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
      indent = Math.floor(leadingSpaces.length / 2);
    }

    // Support markdown strikethrough ~~completed text~~
    const strikeMatch = itemText.match(/^~~(.*)~~$/);
    if (strikeMatch) {
      completed = true;
      itemText = strikeMatch[1].trim();
    }

    const seed = Math.random().toString(36).substring(2, 6);
    return {
      id: `item_${Date.now()}_${idx + 1}_${seed}`,
      text: itemText,
      completed,
      order: idx + 1,
      ...(indent > 0 ? { indent } : {}),
    };
  });
}

// Checklist State Helpers

export function toggleChecklistItem(
  items: ChecklistItem[] | undefined | null,
  itemId: string
): ChecklistItem[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item));
}

export function reorderChecklistItems(
  items: ChecklistItem[] | undefined | null,
  fromIndex: number,
  toIndex: number
): ChecklistItem[] {
  if (!items || items.length === 0) return [];
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return [...items];
  }
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result.map((item, idx) => ({ ...item, order: idx + 1 }));
}

export function cleanChecklistItems(items: ChecklistItem[] | undefined | null): ChecklistItem[] {
  if (!items || items.length === 0) return [];
  return items
    .filter((item) => item.text.trim().length > 0)
    .map((item, idx) => ({ ...item, text: item.text.trim(), order: idx + 1 }));
}

export function checkAllChecklistItems(items: ChecklistItem[] | undefined | null): ChecklistItem[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => (item.completed ? item : { ...item, completed: true }));
}

export function uncheckAllChecklistItems(items: ChecklistItem[] | undefined | null): ChecklistItem[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => (!item.completed ? item : { ...item, completed: false }));
}

export function deleteCompletedChecklistItems(
  items: ChecklistItem[] | undefined | null
): ChecklistItem[] {
  if (!items || items.length === 0) return [];
  return items
    .filter((item) => !item.completed)
    .map((item, idx) => ({ ...item, order: idx + 1 }));
}

// Note Statistics Helper

export function getKeepNoteStats(note: KeepNote, referenceDate = new Date()): KeepNoteStats {
  const checklist = Array.isArray(note.checklistData) ? note.checklistData : [];
  const totalChecklistItems = checklist.length;
  const completedChecklistItems = checklist.filter((i) => i.completed).length;
  const pendingChecklistItems = totalChecklistItems - completedChecklistItems;
  const checklistProgress =
    totalChecklistItems > 0 ? Math.round((completedChecklistItems / totalChecklistItems) * 100) : 0;

  const labels = Array.isArray(note.labels) ? note.labels : [];
  const textContent = note.content || '';
  const combinedText =
    note.type === 'checklist'
      ? checklist.map((i) => i.text).join(' ')
      : textContent;

  const trimmed = combinedText.trim();
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
  const characterCount = trimmed.length;

  let hasReminder = false;
  let isReminderOverdue = false;
  if (note.reminderTime) {
    const reminderEpoch = Date.parse(note.reminderTime);
    if (!Number.isNaN(reminderEpoch)) {
      hasReminder = true;
      isReminderOverdue = reminderEpoch < referenceDate.getTime();
    }
  }

  const hasDrawing = Boolean(
    note.drawingData && Array.isArray(note.drawingData) && note.drawingData.length > 0
  );
  const hasAudio = Boolean(note.audioUri && note.audioUri.trim().length > 0);
  const hasImage = Boolean(note.imageUri && note.imageUri.trim().length > 0);

  return {
    totalChecklistItems,
    completedChecklistItems,
    pendingChecklistItems,
    checklistProgress,
    hasReminder,
    isReminderOverdue,
    wordCount,
    characterCount,
    labelsCount: labels.length,
    hasDrawing,
    hasAudio,
    hasImage,
    isPinned: Boolean(note.isPinned),
    isArchived: Boolean(note.isArchived),
    isTrashed: Boolean(note.isTrashed),
  };
}

// Client-side Sorting and Filtering Utilities

export function sortKeepNotes(notes: KeepNote[]): KeepNote[] {
  return [...notes].sort((a, b) => {
    // 1. Pinned notes always precede unpinned notes
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    // 2. Most recently updated first
    const timeA = Date.parse(a.updatedAt) || 0;
    const timeB = Date.parse(b.updatedAt) || 0;
    return timeB - timeA;
  });
}

export function filterKeepNotes(notes: KeepNote[], filter: KeepNoteFilter = {}): KeepNote[] {
  const { status = 'active', search, label, color } = filter;

  return notes.filter((note) => {
    // Status check
    if (status === 'trash') {
      if (!note.isTrashed) return false;
    } else if (status === 'archived') {
      if (note.isTrashed || !note.isArchived) return false;
    } else if (status === 'reminders') {
      if (note.isTrashed || note.isArchived || !note.reminderTime) return false;
    } else {
      // active
      if (note.isTrashed || note.isArchived) return false;
    }

    // Color check
    if (color && note.color !== color) {
      return false;
    }

    // Label check
    if (label && label.trim().length > 0) {
      const matchLabel = label.trim().toLowerCase();
      if (!note.labels.some((l) => l.toLowerCase() === matchLabel)) {
        return false;
      }
    }

    // Search query check
    if (search && search.trim().length > 0) {
      const query = search.trim().toLowerCase();
      const inTitle = note.title.toLowerCase().includes(query);
      const inContent = note.content.toLowerCase().includes(query);
      const inLabels = note.labels.some((l) => l.toLowerCase().includes(query));
      const inChecklist = note.checklistData.some((item) =>
        item.text.toLowerCase().includes(query)
      );
      if (!inTitle && !inContent && !inLabels && !inChecklist) {
        return false;
      }
    }

    return true;
  });
}

// Note Content Equality Check

export function isNoteContentEqual(a: KeepNote, b: KeepNote): boolean {
  if (a.id !== b.id) return false;
  if (a.title !== b.title) return false;
  if (a.content !== b.content) return false;
  if (a.type !== b.type) return false;
  if (a.color !== b.color) return false;
  if (a.isPinned !== b.isPinned) return false;
  if (a.isArchived !== b.isArchived) return false;
  if (a.isTrashed !== b.isTrashed) return false;
  if ((a.reminderTime || undefined) !== (b.reminderTime || undefined)) return false;
  if ((a.audioUri || undefined) !== (b.audioUri || undefined)) return false;
  if ((a.imageUri || undefined) !== (b.imageUri || undefined)) return false;

  // Compare labels
  if (a.labels.length !== b.labels.length) return false;
  for (let i = 0; i < a.labels.length; i++) {
    if (a.labels[i] !== b.labels[i]) return false;
  }

  // Compare checklistData
  if (a.checklistData.length !== b.checklistData.length) return false;
  for (let i = 0; i < a.checklistData.length; i++) {
    const itemA = a.checklistData[i];
    const itemB = b.checklistData[i];
    if (
      itemA.id !== itemB.id ||
      itemA.text !== itemB.text ||
      itemA.completed !== itemB.completed ||
      itemA.order !== itemB.order ||
      itemA.indent !== itemB.indent
    ) {
      return false;
    }
  }

  return true;
}

// Data Deserializers / Sanitizers

export function parseChecklistData(raw: unknown): ChecklistItem[] {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isChecklistItem);
}

export function parseLabels(raw: unknown): string[] {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((l): l is string => typeof l === 'string');
}

export function parseDrawingData(raw: unknown): DrawingStroke[] | undefined {
  if (!raw) return undefined;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  const strokes = parsed.filter(isDrawingStroke);
  return strokes.length > 0 ? strokes : undefined;
}
