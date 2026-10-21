export interface BulletItem {
  id: string;
  text: string;
  completed?: boolean;
}

/**
 * Parses raw text (e.g. from task.notes or task.description) into an array of BulletItems.
 * Supports bullet prefixes ('• ', '* ', '- ') and checklist prefixes ('[ ] ', '[x] ').
 */
export function parseBulletNotes(rawText?: string | null): BulletItem[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split('\n');
  const items: BulletItem[] = [];

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    let completed = false;
    let cleanText = trimmed;

    if (trimmed.startsWith('[x] ') || trimmed.startsWith('[X] ')) {
      completed = true;
      cleanText = trimmed.substring(4).trim();
    } else if (trimmed.startsWith('[ ] ')) {
      completed = false;
      cleanText = trimmed.substring(4).trim();
    } else if (
      trimmed.startsWith('• ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('- ')
    ) {
      cleanText = trimmed.substring(2).trim();
    }

    items.push({
      id: `bullet_${index}`,
      text: cleanText,
      completed,
    });
  });

  return items;
}

/**
 * Serializes an array of BulletItems back into a string with chosen formatting.
 */
export function serializeBulletNotes(
  items: BulletItem[],
  mode: 'bullets' | 'checklist' | 'text' = 'bullets'
): string {
  const validItems = items.filter((i) => i.text.trim().length > 0);
  if (validItems.length === 0) return '';

  if (mode === 'checklist') {
    return validItems
      .map((i) => `[${i.completed ? 'x' : ' '}] ${i.text.trim()}`)
      .join('\n');
  }

  if (mode === 'bullets') {
    return validItems.map((i) => `• ${i.text.trim()}`).join('\n');
  }

  // Freeform text
  return validItems.map((i) => i.text.trim()).join('\n');
}

/**
 * Checks whether a given string contains formatted bullet notes or checklist items.
 */
export function hasBulletNotes(rawText?: string | null): boolean {
  if (!rawText) return false;
  const trimmed = rawText.trim();
  return (
    trimmed.startsWith('•') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('[')
  );
}

/**
 * Toggles a bullet item at targetIndex in place within rawText, preserving all other lines,
 * markdown headers, URLs, paragraphs, and indentation untouched.
 */
export function toggleBulletInRawText(rawText: string, targetBulletIndex: number): string {
  if (!rawText) return rawText;

  const lines = rawText.split('\n');
  let currentBulletIndex = 0;

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Check if line matches a checklist or bullet pattern
    const isChecked = trimmed.startsWith('[x] ') || trimmed.startsWith('[X] ');
    const isUnchecked = trimmed.startsWith('[ ] ');
    const isBullet =
      trimmed.startsWith('• ') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('- ');

    if (!isChecked && !isUnchecked && !isBullet) {
      return line; // Not a bullet/subtask item, leave completely intact
    }

    if (currentBulletIndex === targetBulletIndex) {
      currentBulletIndex++;
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';

      if (isChecked) {
        // Toggle from checked to unchecked
        const content = trimmed.substring(4);
        return `${indent}[ ] ${content}`;
      } else if (isUnchecked) {
        // Toggle from unchecked to checked
        const content = trimmed.substring(4);
        return `${indent}[x] ${content}`;
      } else if (isBullet) {
        // First toggle of a plain bullet marks it checked
        const content = trimmed.substring(2);
        return `${indent}[x] ${content}`;
      }
    }

    currentBulletIndex++;
    return line;
  });

  return updatedLines.join('\n');
}

/**
 * Parses a habit name into an array of items if it contains '||' or newlines.
 * e.g. "Exercise || Meditate - 15 Min || Yoga" -> ["Exercise", "Meditate - 15 Min", "Yoga"]
 */
export function parseHabitNameItems(name?: string | null): string[] {
  if (!name || !name.trim()) return [];
  const trimmed = name.trim();
  const parts = trimmed
    .split(/\s*\|\|\s*|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/**
 * Formats an item with a numbered prefix (1. , 2. , 3. ...) if not already numbered.
 */
export function formatNumberedItem(item: string, index: number, total: number): string {
  if (total <= 1) return item;
  const numMatch = item.match(/^(\d+)[\.\-\)]?\s*(.*)$/);
  if (numMatch) {
    const textPart = numMatch[2] ? numMatch[2].trim() : '';
    return `${numMatch[1]}. ${textPart || item}`;
  }
  return `${index + 1}. ${item}`;
}

