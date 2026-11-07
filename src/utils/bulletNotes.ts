export interface BulletItem {
  id: string;
  text: string;
  completed?: boolean;
  raw?: string;
  indent?: number;
  marker?: string;
  isCheckbox?: boolean;
}

export interface BulletNotesStats {
  total: number;
  completed: number;
  pending: number;
  percent: number;
}

export type BulletSerializationMode =
  | 'bullets'
  | 'checklist'
  | 'markdown-checklist'
  | 'text'
  | 'dash';

export const CHECKBOX_LINE_REGEX =
  /^(\s*)(?:([-*+•◦▪▫⁃‣–—]|\d{1,4}[\.\)])\s+)?\[([ xXvV\u2713\u2714]?)\](?:\s+(.*))?$/;

export const BULLET_LINE_REGEX =
  /^(\s*)([-*+•◦▪▫⁃‣–—]|\d{1,4}[\.\)])\s+(.*)$/;

export function isBulletLine(line?: string | null): boolean {
  return typeof line === 'string' && parseBulletLine(line, 0) !== null;
}

export function parseBulletLine(line?: string | null, index = 0): BulletItem | null {
  if (!line || typeof line !== 'string') return null;

  const cbMatch = line.match(CHECKBOX_LINE_REGEX);
  if (cbMatch) {
    const indent = cbMatch[1] || '';
    const content = cbMatch[4] ? cbMatch[4].trim() : '';
    if (!content) return null;

    return {
      id: `bullet_${index}`,
      text: content,
      completed: /^[xXvV\u2713\u2714]$/.test(cbMatch[3]),
      raw: line,
      indent: indent.length,
      marker: cbMatch[2],
      isCheckbox: true,
    };
  }

  const bMatch = line.match(BULLET_LINE_REGEX);
  if (bMatch) {
    const indent = bMatch[1] || '';
    const marker = bMatch[2];
    const content = bMatch[3] ? bMatch[3].trim() : '';
    if (!content) return null;
    if (/^[-=_*#]{2,}$/.test(marker + content)) return null;
    if (marker === '-' && /^[\$€£¥₹]\s*\d/.test(content)) return null;

    return {
      id: `bullet_${index}`,
      text: content,
      completed: false,
      raw: line,
      indent: indent.length,
      marker,
      isCheckbox: false,
    };
  }

  return null;
}

export function parseBulletNotes(rawText?: string | null): BulletItem[] {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) return [];
  const lines = rawText.split(/\r?\n/);
  const items: BulletItem[] = [];
  for (const rawLine of lines) {
    const item = parseBulletLine(rawLine, items.length);
    if (item) items.push(item);
  }
  return items;
}

export function serializeBulletNotes(
  items?: BulletItem[] | null,
  mode: BulletSerializationMode = 'bullets'
): string {
  if (!items || !Array.isArray(items) || items.length === 0) return '';
  const valid = items.filter((i) => i && typeof i.text === 'string' && i.text.trim().length > 0);
  if (valid.length === 0) return '';

  switch (mode) {
    case 'checklist':
      return valid.map((i) => `[${i.completed ? 'x' : ' '}] ${i.text.trim()}`).join('\n');
    case 'markdown-checklist':
      return valid.map((i) => `- [${i.completed ? 'x' : ' '}] ${i.text.trim()}`).join('\n');
    case 'dash':
      return valid.map((i) => `- ${i.text.trim()}`).join('\n');
    case 'bullets':
      return valid.map((i) => `• ${i.text.trim()}`).join('\n');
    case 'text':
    default:
      return valid.map((i) => i.text.trim()).join('\n');
  }
}

export function hasBulletNotes(rawText?: string | null): boolean {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) return false;
  return rawText.split(/\r?\n/).some((line) => isBulletLine(line));
}

export function toggleBulletInRawText(
  rawText?: string | null,
  targetBulletIndex: number = 0
): string {
  if (!rawText || typeof rawText !== 'string') return rawText || '';
  if (targetBulletIndex < 0) return rawText;

  const isCrlf = rawText.includes('\r\n');
  const lines = rawText.split(/\r?\n/);
  let currentBulletIndex = 0;

  const updatedLines = lines.map((line) => {
    const parsed = parseBulletLine(line, currentBulletIndex);
    if (!parsed) return line;

    if (currentBulletIndex === targetBulletIndex) {
      currentBulletIndex++;
      const cbMatch = line.match(CHECKBOX_LINE_REGEX);
      const bMatch = !cbMatch ? line.match(BULLET_LINE_REGEX) : null;

      if (cbMatch) {
        const indent = cbMatch[1] || '';
        const marker = cbMatch[2];
        const content = cbMatch[4] ? cbMatch[4].trim() : '';
        const isChecked = /^[xXvV\u2713\u2714]$/.test(cbMatch[3]);
        const nextCheck = isChecked ? '[ ]' : '[x]';
        return marker
          ? `${indent}${marker} ${nextCheck}${content ? ' ' + content : ''}`
          : `${indent}${nextCheck}${content ? ' ' + content : ''}`;
      } else if (bMatch) {
        const indent = bMatch[1] || '';
        const marker = bMatch[2];
        const content = bMatch[3] ? bMatch[3].trim() : '';
        return marker === '•' ? `${indent}[x] ${content}` : `${indent}${marker} [x] ${content}`;
      }
    }

    currentBulletIndex++;
    return line;
  });

  return updatedLines.join(isCrlf ? '\r\n' : '\n');
}

export function addBulletToRawText(
  rawText?: string | null,
  text?: string | null,
  mode: BulletSerializationMode = 'checklist'
): string {
  const clean = (text || '').trim();
  if (!clean) return rawText || '';

  const prefix = mode === 'checklist' ? '[ ] ' :
                 mode === 'markdown-checklist' ? '- [ ] ' :
                 mode === 'dash' ? '- ' : '• ';
  const lineToAdd = `${prefix}${clean}`;

  if (!rawText || !rawText.trim()) return lineToAdd;

  const newline = rawText.includes('\r\n') ? '\r\n' : '\n';
  return rawText.endsWith('\n') ? `${rawText}${lineToAdd}` : `${rawText}${newline}${lineToAdd}`;
}

export function removeBulletFromRawText(
  rawText?: string | null,
  targetBulletIndex?: number
): string {
  if (!rawText || typeof rawText !== 'string') return '';
  if (targetBulletIndex === undefined || targetBulletIndex < 0) return rawText;

  const isCrlf = rawText.includes('\r\n');
  const lines = rawText.split(/\r?\n/);
  let currentBulletIndex = 0;
  const remainingLines: string[] = [];

  for (const line of lines) {
    if (parseBulletLine(line, currentBulletIndex) !== null) {
      if (currentBulletIndex === targetBulletIndex) {
        currentBulletIndex++;
        continue;
      }
      currentBulletIndex++;
    }
    remainingLines.push(line);
  }

  return remainingLines.join(isCrlf ? '\r\n' : '\n');
}

export function getBulletNotesStats(rawText?: string | null): BulletNotesStats {
  const items = parseBulletNotes(rawText);
  const total = items.length;
  if (total === 0) return { total: 0, completed: 0, pending: 0, percent: 0 };
  const completed = items.filter((i) => Boolean(i.completed)).length;
  return { total, completed, pending: total - completed, percent: Math.round((completed / total) * 100) };
}

export function parseHabitNameItems(name?: string | null): string[] {
  if (!name || typeof name !== 'string') return [];
  const trimmed = name.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s*\|\|\s*|\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function formatNumberedItem(
  item?: string | null,
  index = 0,
  total = 1
): string {
  if (!item || typeof item !== 'string') return '';
  if (total <= 1) return item;

  const trimmed = item.trim();
  if (!trimmed) return item;

  if (/^[-=_*#~]{2,}/.test(trimmed) || /[-=_*#~]{2,}$/.test(trimmed) || /^#+\s+/.test(trimmed)) {
    return item;
  }

  const cleanedItem = trimmed.replace(/^[-*+•◦▪▫⁃‣–—]\s+/, '');
  const numMatch = cleanedItem.match(/^(\d+)(?:[\.\)]|\s*[-:])\s+(.*)$/);
  return numMatch
    ? `${index + 1}. ${numMatch[2] ? numMatch[2].trim() : cleanedItem}`
    : `${index + 1}. ${cleanedItem}`;
}

export function resetBulletsInRawText(rawText?: string | null): string {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText.replace(
    /^(\s*(?:[-*+•◦▪▫⁃‣–—]|\d{1,4}[\.\)])?\s*)\[[xXvV\u2713\u2714]\]/gm,
    (_match, prefix) => `${prefix}[ ]`
  );
}
