/**
 * Time normalization and parsing utilities for Life Planner
 */

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const clean = timeStr.replace(/[⏰🕒]/g, '').trim();

  // Match 12h format e.g. "07:30 PM", "7:30am"
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // Match 24h format e.g. "19:30", "07:30", "7:30"
  const h24Match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const minutes = parseInt(h24Match[2], 10);
    return hours * 60 + minutes;
  }

  return null;
}

export function normalizeTimeTo24H(timeStr?: string | null): string | undefined {
  if (!timeStr) return undefined;
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) {
    return timeStr.trim() || undefined;
  }
  const hours = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTimeTo12H(timeStr?: string | null): string {
  if (!timeStr) return '';
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return timeStr;

  const hours24 = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;

  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}
