export type TimeInput = string | number | Date | null | undefined;

function cleanTimeString(timeStr: string): string {
  return timeStr
    .replace(/[\u{1F550}-\u{1F567}⏰🕒⏱⏳⌛🔔🏁\uFE00-\uFE0F]/gu, '')
    .trim()
    .replace(/^[@~]\s*|^(?:at|from|around|by|until)\s+/i, '')
    .replace(/\s*(?:sharp|hrs|hours|o'?clock|utc|gmt|est|edt|cst|cdt|mst|mdt|pst|pdt|ist)\b/i, '')
    .replace(/^T(?=\d{1,2}[:.])/i, '')
    .trim();
}

function minutesTo12H(mins: number, padHour = false): string {
  const safeMins = ((Math.floor(mins) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(safeMins / 60);
  const minutes = safeMins % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;

  const hourDisplay = padHour ? String(hours12).padStart(2, '0') : String(hours12);
  return `${hourDisplay}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function isTimeValid(timeStr?: TimeInput): boolean {
  return parseTimeToMinutes(timeStr) !== null;
}

export function compareTimes(timeA?: TimeInput, timeB?: TimeInput): number {
  const minA = parseTimeToMinutes(timeA) ?? 9999;
  const minB = parseTimeToMinutes(timeB) ?? 9999;
  return minA - minB;
}

export function parseTimeToMinutes(timeStr?: TimeInput): number | null {
  if (timeStr === undefined || timeStr === null) return null;
  if (timeStr instanceof Date) {
    return isNaN(timeStr.getTime()) ? null : timeStr.getHours() * 60 + timeStr.getMinutes();
  }

  const rawStr = typeof timeStr === 'string' ? timeStr : String(timeStr);
  const clean = cleanTimeString(rawStr);
  if (!clean) return null;

  const lower = clean.toLowerCase();
  if (lower === 'noon' || lower === 'midday' || /^12(:00|\.00)?\s+noon$/.test(lower)) return 720;
  if (lower === 'midnight' || /^12(:00|\.00)?\s+midnight$/.test(lower)) return 0;

  // 1. ISO 8601 string or Date string
  const isoMatch = clean.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[T\s](\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i);
  if (isoMatch) {
    if (/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(clean)) {
      const d = new Date(clean.replace(/\//g, '-').replace(' ', 'T').replace(/\s+([+-])/, '$1'));
      return isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
    }
    const h = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : null;
  }

  // 2. Epoch timestamp
  if (/^\d{10}$/.test(clean)) {
    const d = new Date(Number(clean) * 1000);
    return isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
  }
  if (/^\d{13}$/.test(clean)) {
    const d = new Date(Number(clean));
    return isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
  }

  // 3. Compact 12h format (e.g. 730pm, 1130am)
  const compactAmPmMatch = clean.match(/^(\d{1,2})(\d{2})\s*([ap]\.?(?:m\.?)?)$/i);
  if (compactAmPmMatch) {
    let hours = parseInt(compactAmPmMatch[1], 10);
    const minutes = parseInt(compactAmPmMatch[2], 10);
    const isPm = compactAmPmMatch[3].toLowerCase().startsWith('p');
    if (hours >= 0 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (isPm && hours < 12) hours += 12;
      else if (!isPm && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
  }

  // 4. Standard 12h format (e.g. 7:30 PM, 7pm, 7.30 pm)
  const ampmMatch = clean.match(/^(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?(?:\s*[:.]\s*(\d{1,2}))?\s*([ap]\.?(?:m\.?)?)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] !== undefined ? parseInt(ampmMatch[2], 10) : 0;
    const seconds = ampmMatch[3] !== undefined ? parseInt(ampmMatch[3], 10) : 0;
    const isPm = ampmMatch[4].toLowerCase().startsWith('p');

    if (hours < 0 || hours > 12 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    if (isPm && hours < 12) hours += 12;
    else if (!isPm && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // 5. Standard 24h format (e.g. 19:30, 07:30, 14.30)
  const h24Match = clean.match(/^(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?$/) ||
                   clean.match(/^(\d{1,2})\s*\.\s*(\d{2})(?:\s*\.\s*(\d{2}))?$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const minutes = parseInt(h24Match[2], 10);
    const seconds = h24Match[3] !== undefined ? parseInt(h24Match[3], 10) : 0;

    if (hours === 24 && minutes === 0 && seconds === 0) return 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    return hours * 60 + minutes;
  }

  // 6. Military 4-digit format (e.g. 0730, 1930)
  const militaryMatch = clean.match(/^(\d{2})(\d{2})h?$/i);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const minutes = parseInt(militaryMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }

  return null;
}

export function normalizeTimeTo24H(timeStr?: TimeInput): string | undefined {
  if (timeStr === undefined || timeStr === null) return undefined;
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return undefined;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTimeTo12H(timeStr?: TimeInput, padHour = false): string {
  if (timeStr === undefined || timeStr === null) return '';
  const mins = parseTimeToMinutes(timeStr);
  return mins === null ? '' : minutesTo12H(mins, padHour);
}

export function formatTimeRange(
  start?: TimeInput,
  end?: TimeInput,
  isAllDay?: boolean,
  isOvernight?: boolean,
  separator = ' – '
): string {
  if (isAllDay) return 'All Day';

  const hasStart = start !== undefined && start !== null && (typeof start !== 'string' || start.trim().length > 0);
  const hasEnd = end !== undefined && end !== null && (typeof end !== 'string' || end.trim().length > 0);

  if (!hasStart && !hasEnd) {
    return isAllDay === false ? '' : 'All Day';
  }

  const startMin = hasStart ? parseTimeToMinutes(start) : null;
  const endMin = hasEnd ? parseTimeToMinutes(end) : null;

  if (hasStart && startMin === null) return '';
  if (hasEnd && endMin === null) return '';

  const startFmt = startMin !== null ? minutesTo12H(startMin) : '';
  const endFmt = endMin !== null ? minutesTo12H(endMin) : '';

  if (startFmt && !endFmt) return startFmt;
  if (!startFmt && endFmt) return `Until ${endFmt}`;
  if (!startFmt && !endFmt) return '';

  const overnight = isOvernight !== undefined
    ? isOvernight
    : (startMin !== null && endMin !== null && endMin < startMin);

  if (startFmt === endFmt && !overnight) return startFmt;

  const overnightSuffix = overnight ? ' (+1d)' : '';
  return `${startFmt}${separator}${endFmt}${overnightSuffix}`;
}

export function calculateDurationMinutes(
  start?: TimeInput,
  end?: TimeInput,
  isOvernight?: boolean
): number | null {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null) return null;
  if (isOvernight === false && endMin < startMin) return null;

  const overnight = isOvernight !== undefined ? isOvernight : endMin < startMin;
  const effectiveEnd = overnight && endMin <= startMin ? endMin + 1440 : endMin;
  return effectiveEnd - startMin;
}

export function formatDurationMinutes(minutes: number): string {
  if (isNaN(minutes) || minutes < 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function addMinutesToTime(
  timeStr?: TimeInput,
  minutesToAdd = 0,
  defaultFallback = '10:00'
): { time: string; isOvernight: boolean } {
  const baseM = parseTimeToMinutes(timeStr);
  if (baseM === null) {
    return { time: defaultFallback, isOvernight: false };
  }

  const total = baseM + minutesToAdd;
  const normalized = ((total % 1440) + 1440) % 1440;
  const isOvernight = total >= 1440;

  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  return { time, isOvernight };
}
