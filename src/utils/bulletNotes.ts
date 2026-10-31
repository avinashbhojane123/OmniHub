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

/**
 * Regex matching checkbox lines:
 * - Standalone: "[ ] task", "[x] task", "[X] task", "[✓] task", "[✔] task", "[v] task"
 * - Prefixed: "- [ ] task", "* [x] task", "+ [✓] task", "• [ ] task", "1. [ ] task"
 * Captures:
 *  1: Indentation
 *  2: Optional list marker (-, *, +, •, 1., etc.)
 *  3: Checkbox content character (' ', 'x', 'X', '✓', '✔', 'v', 'V', or empty)
 *  4: Task content
 */
export const CHECKBOX_LINE_REGEX =
  /^(\s*)(?:([-*+•◦▪▫⁃‣–—]|\d{1,4}[\.\)])\s+)?\[([ xXvV\u2713\u2714]?)\](?:\s+(.*))?$/;

/**
 * Regex matching plain bullet or numbered list lines:
 * - "• task", "- task", "* task", "+ task", "◦ task", "▪ task", "1. task", "1) task"
 * Captures:
 *  1: Indentation
 *  2: List marker
 *  3: Content
 */
export const BULLET_LINE_REGEX =
  /^(\s*)([-*+•◦▪▫⁃‣–—]|\d{1,4}[\.\)])\s+(.*)$/;

/**
 * Checks whether a single line is a bullet or checklist item,
 * distinguishing it from headings, horizontal rules, tags, and plain text.
 */
export function isBulletLine(line?: string | null): boolean {
  if (!line || typeof line !== 'string') return false;
  return parseBulletLine(line, 0) !== null;
}

/**
 * Parses an individual text line into a BulletItem, or returns null if not a bullet/checklist line.
 */
export function parseBulletLine(line?: string | null, index = 0): BulletItem | null {
  if (!line || typeof line !== 'string') return null;

  const cbMatch = line.match(CHECKBOX_LINE_REGEX);
  if (cbMatch) {
    const indent = cbMatch[1] || '';
    const marker = cbMatch[2];
    const checkChar = cbMatch[3];
    const content = cbMatch[4] ? cbMatch[4].trim() : '';
    if (!content) return null; // Avoid ghost items for blank lines like "[ ]"

    const isChecked = /^[xXvV\u2713\u2714]$/.test(checkChar);
    return {
      id: `bullet_${index}`,
      text: content,
      completed: isChecked,
      raw: line,
      indent: indent.length,
      marker,
      isCheckbox: true,
    };
  }

  const bMatch = line.match(BULLET_LINE_REGEX);
  if (bMatch) {
    const indent = bMatch[1] || '';
    const marker = bMatch[2];
    const content = bMatch[3] ? bMatch[3].trim() : '';
    if (!content) return null;

    // Do not match horizontal rules (e.g. "---", "***") or bold/italic markers
    if (/^[-=_*#]{2,}$/.test(marker + content)) {
      return null;
    }

    // Do not match negative currency amounts (e.g. "- $20", "- €50", "- ₹100")
    if (marker === '-' && /^[\$€£¥₹]\s*\d/.test(content)) {
      return null;
    }

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

/**
 * Parses raw text (e.g. from task.notes or task.description) into an array of BulletItems.
 * Supports:
 * - Checkboxes: '[ ] ', '[x] ', '[X] ', '[✓] ', '[✔] ', '[v] '
 * - Markdown checklists: '- [ ] ', '- [x] ', '* [ ] ', '+ [ ] ', '• [ ] ', '1. [ ] '
 * - Plain bullets: '• ', '* ', '- ', '+ ', '◦ ', '▪ ', '▫ ', '⁃ ', '‣ '
 * - Numbered items: '1. ', '1) '
 */
export function parseBulletNotes(rawText?: string | null): BulletItem[] {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const items: BulletItem[] = [];

  for (const rawLine of lines) {
    const item = parseBulletLine(rawLine, items.length);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Serializes an array of BulletItems back into a string with chosen formatting.
 */
export function serializeBulletNotes(
  items?: BulletItem[] | null,
  mode: BulletSerializationMode = 'bullets'
): string {
  if (!items || !Array.isArray(items) || items.length === 0) return '';

  const validItems = items.filter(
    (i) => i && typeof i.text === 'string' && i.text.trim().length > 0
  );
  if (validItems.length === 0) return '';

  switch (mode) {
    case 'checklist':
      return validItems
        .map((i) => `[${i.completed ? 'x' : ' '}] ${i.text.trim()}`)
        .join('\n');
    case 'markdown-checklist':
      return validItems
        .map((i) => `- [${i.completed ? 'x' : ' '}] ${i.text.trim()}`)
        .join('\n');
    case 'dash':
      return validItems.map((i) => `- ${i.text.trim()}`).join('\n');
    case 'bullets':
      return validItems.map((i) => `• ${i.text.trim()}`).join('\n');
    case 'text':
    default:
      return validItems.map((i) => i.text.trim()).join('\n');
  }
}

/**
 * Checks whether a given string contains formatted bullet notes or checklist items.
 * Unlike naive prefix checks, this inspects across all lines and avoids false positives
 * on negative numbers ("-5"), bold headers ("**important**"), tags ("[Urgent]"), or dividers ("---").
 */
export function hasBulletNotes(rawText?: string | null): boolean {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) return false;
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    if (isBulletLine(line)) {
      return true;
    }
  }
  return false;
}

/**
 * Toggles a bullet item at targetIndex in place within rawText, preserving all other lines,
 * markdown headers, URLs, paragraphs, and indentation untouched.
 * Preserves the exact list style:
 * - "- [ ] Task" toggles to "- [x] Task"
 * - "- [x] Task" toggles to "- [ ] Task"
 * - "[ ] Task" toggles to "[x] Task"
 * - "• Task" toggles to "[x] Task" (or "- [x] Task")
 */
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
        const checkChar = cbMatch[3];
        const content = cbMatch[4] ? cbMatch[4].trim() : '';
        const isChecked = /^[xXvV\u2713\u2714]$/.test(checkChar);
        const nextCheck = isChecked ? '[ ]' : '[x]';

        if (marker) {
          return `${indent}${marker} ${nextCheck}${content ? ' ' + content : ''}`;
        }
        return `${indent}${nextCheck}${content ? ' ' + content : ''}`;
      } else if (bMatch) {
        const indent = bMatch[1] || '';
        const marker = bMatch[2];
        const content = bMatch[3] ? bMatch[3].trim() : '';

        // For plain bullets:
        // If bullet symbol (•), standardize to '[x] content' for legacy compatibility
        // If markdown dash/star/plus, preserve list marker: '- [x] content'
        if (marker === '•') {
          return `${indent}[x] ${content}`;
        }
        return `${indent}${marker} [x] ${content}`;
      }
    }

    currentBulletIndex++;
    return line;
  });

  return updatedLines.join(isCrlf ? '\r\n' : '\n');
}

/**
 * Appends a new bullet item cleanly to the end of rawText, handling newlines properly.
 */
export function addBulletToRawText(
  rawText?: string | null,
  text?: string | null,
  mode: BulletSerializationMode = 'checklist'
): string {
  const clean = (text || '').trim();
  if (!clean) return rawText || '';

  let lineToAdd = '';
  switch (mode) {
    case 'checklist':
      lineToAdd = `[ ] ${clean}`;
      break;
    case 'markdown-checklist':
      lineToAdd = `- [ ] ${clean}`;
      break;
    case 'dash':
      lineToAdd = `- ${clean}`;
      break;
    case 'bullets':
    default:
      lineToAdd = `• ${clean}`;
      break;
  }

  if (!rawText || !rawText.trim()) {
    return lineToAdd;
  }

  const isCrlf = rawText.includes('\r\n');
  const newline = isCrlf ? '\r\n' : '\n';
  const endsWithNewline = rawText.endsWith('\n');

  return endsWithNewline ? `${rawText}${lineToAdd}` : `${rawText}${newline}${lineToAdd}`;
}

/**
 * Removes a bullet item at targetIndex in place within rawText, preserving all surrounding
 * headings, paragraphs, and untouched bullet items without clobbering text into pure checklists.
 */
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
    const isBulletOrCb = parseBulletLine(line, currentBulletIndex) !== null;

    if (isBulletOrCb) {
      if (currentBulletIndex === targetBulletIndex) {
        currentBulletIndex++;
        continue; // Drop target bullet line
      }
      currentBulletIndex++;
    }
    remainingLines.push(line);
  }

  return remainingLines.join(isCrlf ? '\r\n' : '\n');
}

/**
 * Computes bullet notes and subtasks completion statistics.
 */
export function getBulletNotesStats(rawText?: string | null): BulletNotesStats {
  const items = parseBulletNotes(rawText);
  const total = items.length;
  if (total === 0) {
    return { total: 0, completed: 0, pending: 0, percent: 0 };
  }
  const completed = items.filter((i) => Boolean(i.completed)).length;
  const pending = total - completed;
  const percent = Math.round((completed / total) * 100);
  return { total, completed, pending, percent };
}

/**
 * Parses a habit name into an array of items if it contains '||' or newlines.
 * e.g. "Exercise || Meditate - 15 Min || Yoga" -> ["Exercise", "Meditate - 15 Min", "Yoga"]
 */
export function parseHabitNameItems(name?: string | null): string[] {
  if (!name || typeof name !== 'string') return [];
  const trimmed = name.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s*\|\|\s*|\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts;
}

/**
 * Formats an individual item within a multi-item habit or list with appropriate numbering.
 * Guards against corrupting unit values and durations (e.g. "10 min meditation", "20 pushups"),
 * strips duplicate bullet prefixes, and preserves section headings.
 */
export function formatNumberedItem(
  item?: string | null,
  index = 0,
  total = 1
): string {
  if (!item || typeof item !== 'string') return '';
  if (total <= 1) return item;

  const trimmed = item.trim();
  if (!trimmed) return item;

  // Don't number section dividers or headings (e.g. "----------------DRINKS----------------", "### Workout")
  if (
    /^[-=_*#~]{2,}/.test(trimmed) ||
    /[-=_*#~]{2,}$/.test(trimmed) ||
    /^#+\s+/.test(trimmed)
  ) {
    return item;
  }

  // Strip existing plain bullet marker if present (e.g. "• Meditation" -> "Meditation")
  const cleanedItem = trimmed.replace(/^[-*+•◦▪▫⁃‣–—]\s+/, '');

  // Match existing numbering prefix like "1. ", "1) ", "1 - ", "1: "
  const numMatch = cleanedItem.match(/^(\d+)(?:[\.\)]|\s*[-:])\s+(.*)$/);
  if (numMatch) {
    const textPart = numMatch[2] ? numMatch[2].trim() : '';
    return `${index + 1}. ${textPart || cleanedItem}`;
  }

  return `${index + 1}. ${cleanedItem}`;
}

/**
 * Resets all checklist subtasks from checked ([x], [X], [✓], [✔], [v], [V]) back to unchecked ([ ])
 * for new recurring occurrences, leaving all text, bullets, paragraphs, and markdown untouched.
 * Correctly resets both standalone checkboxes ([x]) and markdown prefixed checkboxes (- [x], * [x], + [x], • [x], 1. [x]).
 */
export function resetBulletsInRawText(rawText?: string | null): string {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText.replace(
    /^(\s*(?:[-*+•◦▪▫⁃‣–—]|\d{1,4}[\.\)])?\s*)\[[xXvV\u2713\u2714]\]/gm,
    (_match, prefix) => `${prefix}[ ]`
  );
}
