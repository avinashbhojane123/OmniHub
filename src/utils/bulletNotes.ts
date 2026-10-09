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
