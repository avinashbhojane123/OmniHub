/**
 * Time normalization and parsing utilities for Life Planner
 */

export type TimeInput = string | number | Date | null | undefined;

/**
 * Strips clock emojis, alarm symbols, leading '@', '~', or 'at' prefixes, and surrounding whitespace.
 */
function cleanTimeString(timeStr: string): string {
  return timeStr
    .replace(/[\u{1F550}-\u{1F567}⏰🕒⏱⏳⌛🔔🏁\uFE00-\uFE0F]/gu, '')
    .trim()
    .replace(/^[@~]\s*|^(?:at|from|around|by|until)\s+/i, '')
    .replace(/\s*(?:sharp|hrs|hours|o'?clock|utc|gmt|est|edt|cst|cdt|mst|mdt|pst|pdt|ist)\b/i, '')
    .replace(/^T(?=\d{1,2}[:.])/i, '')
    .trim();
}

/**
 * Formats minute count (0 - 1439) into 12-hour "h:mm A" display format.
 * Safely normalizes out-of-range minutes.
 */
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

/**
 * Validates whether a given time input can be parsed into a valid time.
 */
export function isTimeValid(timeStr?: TimeInput): boolean {
  return parseTimeToMinutes(timeStr) !== null;
}

/**
 * Compares two time inputs chronologically.
 * Returns negative if timeA is earlier than timeB, 0 if equal, positive if timeA is later.
 * Unparseable/null times sort to the end (treated as 9999).
 */
export function compareTimes(timeA?: TimeInput, timeB?: TimeInput): number {
  const minA = parseTimeToMinutes(timeA) ?? 9999;
  const minB = parseTimeToMinutes(timeB) ?? 9999;
  return minA - minB;
}

/**
 * Parses any supported time string, number, or Date instance into minutes since midnight (0 - 1439).
 * Supports standard colons, dots (e.g. 7.30 pm), compact 12h (730pm, 7p), 24h, ISO 8601, military time, and keywords (noon, midnight).
 * Returns null if the input is empty or invalid.
 */
export function parseTimeToMinutes(timeStr?: TimeInput): number | null {
  if (timeStr === undefined || timeStr === null) return null;
  if (timeStr instanceof Date) {
    if (isNaN(timeStr.getTime())) return null;
    return timeStr.getHours() * 60 + timeStr.getMinutes();
  }

  const rawStr = typeof timeStr === 'string' ? timeStr : String(timeStr);
  const clean = cleanTimeString(rawStr);
  if (!clean) return null;

  const lower = clean.toLowerCase();

  // Natural language keywords: "noon", "midday", "midnight"
  if (lower === 'noon' || lower === 'midday' || lower === '12 noon' || lower === '12:00 noon' || lower === '12.00 noon') {
    return 720;
  }
  if (lower === 'midnight' || lower === '12 midnight' || lower === '12:00 midnight' || lower === '12.00 midnight') {
    return 0;
  }

  // 1. ISO 8601 string or Date string (e.g. "2026-10-12T14:30:00.000Z", "2026-10-12 14:30:00", "2026/10/12 14:30")
  const isoMatch = clean.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[T\s](\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i);
  if (isoMatch) {
    // Only parse via Date if there is an explicit timezone indicator at the end (Z or +/-HH:mm).
    // Note: Must match at the end ($) to avoid false-matching month/day dashes in YYYY-MM-DD.
    const hasTzOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(clean);
    if (hasTzOffset) {
      const normalizedIso = clean.replace(/\//g, '-').replace(' ', 'T').replace(/\s+([+-])/, '$1');
      const d = new Date(normalizedIso);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
    } else {
      // Pure wall-clock ISO time: extract hours and minutes directly to avoid engine timezone distortion
      const h = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return h * 60 + m;
      }
    }
  }

  // 2. Epoch timestamp: 10 digits (seconds) or 13 digits (milliseconds)
  if (/^\d{10}$/.test(clean)) {
    const d = new Date(Number(clean) * 1000);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  } else if (/^\d{13}$/.test(clean)) {
    const d = new Date(Number(clean));
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  // 3. Compact 3- or 4-digit 12h format e.g. "730pm", "1130am", "830 am", "730p"
  const compactAmPmMatch = clean.match(/^(\d{1,2})(\d{2})\s*([ap]\.?(?:m\.?)?)$/i);
  if (compactAmPmMatch) {
    let hours = parseInt(compactAmPmMatch[1], 10);
    const minutes = parseInt(compactAmPmMatch[2], 10);
    const isPm = compactAmPmMatch[3].toLowerCase().startsWith('p');

    if (hours >= 0 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (isPm && hours < 12) {
        hours += 12;
      } else if (!isPm && hours === 12) {
        hours = 0;
      }
      return hours * 60 + minutes;
    }
  }

  // 4. Standard 12h format e.g. "07:30 PM", "7:30am", "7pm", "7p", "12am", "7.30 pm", "7.30 a.m.", "7 : 30 PM"
  const ampmMatch = clean.match(/^(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?(?:\s*[:.]\s*(\d{1,2}))?\s*([ap]\.?(?:m\.?)?)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] !== undefined ? parseInt(ampmMatch[2], 10) : 0;
    const seconds = ampmMatch[3] !== undefined ? parseInt(ampmMatch[3], 10) : 0;
    const isPm = ampmMatch[4].toLowerCase().startsWith('p');

    if (hours < 0 || hours > 12) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (seconds < 0 || seconds > 59) return null;

    if (isPm && hours < 12) {
      hours += 12;
    } else if (!isPm && hours === 12) {
      hours = 0;
    }
    return hours * 60 + minutes;
  }

  // 5. Standard 24h format e.g. "19:30", "07:30", "7:30", "14.30", "14:30:00", "7:5", "14 : 30"
  // Note: For dot separator, require 2-digit minutes to avoid misparsing decimal numbers like '1.5' or '3.14'
  const h24ColonMatch = clean.match(/^(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?$/);
  const h24DotMatch = clean.match(/^(\d{1,2})\s*\.\s*(\d{2})(?:\s*\.\s*(\d{2}))?$/);
  const h24Match = h24ColonMatch || h24DotMatch;
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const minutes = parseInt(h24Match[2], 10);
    const seconds = h24Match[3] !== undefined ? parseInt(h24Match[3], 10) : 0;

    if (hours === 24 && minutes === 0 && seconds === 0) {
      return 0;
    }
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (seconds < 0 || seconds > 59) return null;

    return hours * 60 + minutes;
  }

  // 6. Military 4-digit format e.g. "0730", "1930", "0730h", "1930h"
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

/**
 * Normalizes any supported time input into 24-hour "HH:mm" format.
 * Returns undefined if the input is empty or cannot be parsed.
 */
export function normalizeTimeTo24H(timeStr?: TimeInput): string | undefined {
  if (timeStr === undefined || timeStr === null) return undefined;
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) {
    return undefined;
  }
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Formats a time input into 12-hour "h:mm A" display format (e.g. "7:30 PM", "12:00 AM").
 * Set padHour = true for 2-digit hour display (e.g. "07:30 PM").
 * Returns an empty string if input is empty or invalid.
 */
export function formatTimeTo12H(timeStr?: TimeInput, padHour = false): string {
  if (timeStr === undefined || timeStr === null) return '';
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return '';
  return minutesTo12H(mins, padHour);
}

/**
 * Formats a start and optional end time into a clean range string.
 * Handles all-day events, start-only, end-only (deadlines), identical times, and overnight shifts (+1d).
 */
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

  // Parse minutes once to prevent redundant double-parsing
  const startMin = hasStart ? parseTimeToMinutes(start) : null;
  const endMin = hasEnd ? parseTimeToMinutes(end) : null;

  // If a string was provided but failed parsing, return empty to prevent displaying corrupt data
  if (hasStart && startMin === null) return '';
  if (hasEnd && endMin === null) return '';

  const startFmt = startMin !== null ? minutesTo12H(startMin) : '';
  const endFmt = endMin !== null ? minutesTo12H(endMin) : '';

  if (startFmt && !endFmt) {
    return startFmt;
  }

  if (!startFmt && endFmt) {
    return `Until ${endFmt}`;
  }

  if (!startFmt && !endFmt) {
    return '';
  }

  const overnight = isOvernight !== undefined
    ? isOvernight
    : (startMin !== null && endMin !== null && endMin < startMin);

  if (startFmt === endFmt && !overnight) {
    return startFmt;
  }

  const overnightSuffix = overnight ? ' (+1d)' : '';
  return `${startFmt}${separator}${endFmt}${overnightSuffix}`;
}

/**
 * Calculates duration in minutes between start and end times.
 * Handles overnight wraps automatically if isOvernight is true or end < start.
 * Returns null if either time cannot be parsed, or if end < start when isOvernight is false.
 */
export function calculateDurationMinutes(
  start?: TimeInput,
  end?: TimeInput,
  isOvernight?: boolean
): number | null {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null) return null;

  // Invalid chronological order if explicitly flagged as not overnight
  if (isOvernight === false && endMin < startMin) {
    return null;
  }

  const overnight = isOvernight !== undefined ? isOvernight : endMin < startMin;
  const effectiveEnd = overnight && endMin <= startMin ? endMin + 1440 : endMin;
  return effectiveEnd - startMin;
}

/**
 * Formats a duration in minutes into a human-readable string (e.g. "1h 30m", "45m", "2h").
 */
export function formatDurationMinutes(minutes: number): string {
  if (isNaN(minutes) || minutes < 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Adds minutes to a given time input and returns the new 24h time and whether it wrapped past midnight (+1d).
 * Safely falls back to defaultFallback (default "10:00") if the base time cannot be parsed.
 */
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
