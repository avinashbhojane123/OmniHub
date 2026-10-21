export type KeepNoteType = 'text' | 'checklist' | 'drawing' | 'audio';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  color: string;
  width: number;
  points: DrawingPoint[];
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

export interface KeepColorDef {
  key: KeepColorKey;
  name: string;
  lightBg: string;
  lightBorder: string;
  darkBg: string;
  darkBorder: string;
}

export const KEEP_COLORS: Record<KeepColorKey, KeepColorDef> = {
  default: {
    key: 'default',
    name: 'Default',
    lightBg: '#FFFFFF',
    lightBorder: '#E2E8F0',
    darkBg: '#1E293B',
    darkBorder: '#334155',
  },
  coral: {
    key: 'coral',
    name: 'Coral',
    lightBg: '#FEE2E2',
    lightBorder: '#FECACA',
    darkBg: '#451A1A',
    darkBorder: '#7F1D1D',
  },
  peach: {
    key: 'peach',
    name: 'Peach',
    lightBg: '#FFEDD5',
    lightBorder: '#FED7AA',
    darkBg: '#431407',
    darkBorder: '#7C2D12',
  },
  sand: {
    key: 'sand',
    name: 'Sand',
    lightBg: '#FEF9C3',
    lightBorder: '#FEF08A',
    darkBg: '#3F3507',
    darkBorder: '#713F12',
  },
  mint: {
    key: 'mint',
    name: 'Mint',
    lightBg: '#DCFCE7',
    lightBorder: '#BBF7D0',
    darkBg: '#143823',
    darkBorder: '#14532D',
  },
  sage: {
    key: 'sage',
    name: 'Sage',
    lightBg: '#CCFBF1',
    lightBorder: '#99F6E4',
    darkBg: '#133534',
    darkBorder: '#115E59',
  },
  fog: {
    key: 'fog',
    name: 'Fog',
    lightBg: '#E0F2FE',
    lightBorder: '#BAE6FD',
    darkBg: '#0C2D48',
    darkBorder: '#075985',
  },
  storm: {
    key: 'storm',
    name: 'Storm',
    lightBg: '#DBEAFE',
    lightBorder: '#BFDBFE',
    darkBg: '#172554',
    darkBorder: '#1E40AF',
  },
  dusk: {
    key: 'dusk',
    name: 'Dusk',
    lightBg: '#F3E8FF',
    lightBorder: '#E9D5FF',
    darkBg: '#31104D',
    darkBorder: '#581C87',
  },
  blossom: {
    key: 'blossom',
    name: 'Blossom',
    lightBg: '#FCE7F3',
    lightBorder: '#FBCFE8',
    darkBg: '#4A1135',
    darkBorder: '#831843',
  },
  clay: {
    key: 'clay',
    name: 'Clay',
    lightBg: '#F5EBE1',
    lightBorder: '#E6D7C3',
    darkBg: '#38281D',
    darkBorder: '#543D2B',
  },
  chalk: {
    key: 'chalk',
    name: 'Chalk',
    lightBg: '#F1F5F9',
    lightBorder: '#E2E8F0',
    darkBg: '#242B35',
    darkBorder: '#3F4957',
  },
};
