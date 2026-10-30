import {
  parseTimeToMinutes,
  normalizeTimeTo24H,
  formatTimeTo12H,
  formatTimeRange,
  calculateDurationMinutes,
  formatDurationMinutes,
  addMinutesToTime,
  compareTimes,
  isTimeValid,
} from '../src/utils/time';

describe('Time Utilities (src/utils/time.ts)', () => {
  describe('parseTimeToMinutes', () => {
    it('returns null for null, undefined, empty, or whitespace strings', () => {
      expect(parseTimeToMinutes(null)).toBeNull();
      expect(parseTimeToMinutes(undefined)).toBeNull();
      expect(parseTimeToMinutes('')).toBeNull();
      expect(parseTimeToMinutes('   ')).toBeNull();
    });

    it('strips clock emojis, alarms, symbols, timezone words, and prefixes/suffixes', () => {
      expect(parseTimeToMinutes('⏰ 07:30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('🕒 14:00')).toBe(14 * 60);
      expect(parseTimeToMinutes('🏁 18:30')).toBe(18 * 60 + 30);
      expect(parseTimeToMinutes('⏱️ 09:15')).toBe(9 * 60 + 15);
      expect(parseTimeToMinutes('🔔 08:00 AM')).toBe(8 * 60);
      expect(parseTimeToMinutes('@07:30')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('~15:45')).toBe(15 * 60 + 45);
      expect(parseTimeToMinutes('at 7:30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('from 10:00 AM')).toBe(10 * 60);
      expect(parseTimeToMinutes('by 5:00 PM')).toBe(17 * 60);
      expect(parseTimeToMinutes('until 5:00 PM')).toBe(17 * 60);
      expect(parseTimeToMinutes('around 7:30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('1900 hrs')).toBe(19 * 60);
      expect(parseTimeToMinutes('19:00 hrs')).toBe(19 * 60);
      expect(parseTimeToMinutes('7:00 sharp')).toBe(7 * 60);
      expect(parseTimeToMinutes("7 o'clock pm")).toBe(19 * 60);
      expect(parseTimeToMinutes('10:00 AM EST')).toBe(10 * 60);
      expect(parseTimeToMinutes('14:30 UTC')).toBe(14 * 60 + 30);
      expect(parseTimeToMinutes('⏰ at 7:30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('T14:30:00')).toBe(14 * 60 + 30);
    });

    it('handles Date instances and numeric timestamps safely without throwing', () => {
      const d = new Date(2026, 9, 12, 15, 45);
      expect(parseTimeToMinutes(d)).toBe(15 * 60 + 45);
      expect(parseTimeToMinutes(new Date('invalid'))).toBeNull();
    });

    it('parses natural language terms like noon, midday, and midnight', () => {
      expect(parseTimeToMinutes('noon')).toBe(12 * 60);
      expect(parseTimeToMinutes('midday')).toBe(12 * 60);
      expect(parseTimeToMinutes('12 noon')).toBe(12 * 60);
      expect(parseTimeToMinutes('12:00 noon')).toBe(12 * 60);
      expect(parseTimeToMinutes('midnight')).toBe(0);
      expect(parseTimeToMinutes('12 midnight')).toBe(0);
      expect(parseTimeToMinutes('12:00 midnight')).toBe(0);
    });

    it('parses compact 12h formats without separators (730pm, 1130am, 730p)', () => {
      expect(parseTimeToMinutes('730pm')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('1130am')).toBe(11 * 60 + 30);
      expect(parseTimeToMinutes('830 am')).toBe(8 * 60 + 30);
      expect(parseTimeToMinutes('1230pm')).toBe(12 * 60 + 30);
      expect(parseTimeToMinutes('730p')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('730a')).toBe(7 * 60 + 30);
    });

    it('parses standard 12-hour AM/PM formats accurately', () => {
      expect(parseTimeToMinutes('12:00 AM')).toBe(0);
      expect(parseTimeToMinutes('12:30 AM')).toBe(30);
      expect(parseTimeToMinutes('07:30 AM')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('11:59 AM')).toBe(11 * 60 + 59);
      expect(parseTimeToMinutes('12:00 PM')).toBe(12 * 60);
      expect(parseTimeToMinutes('12:30 PM')).toBe(12 * 60 + 30);
      expect(parseTimeToMinutes('07:30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('11:59 PM')).toBe(23 * 60 + 59);
    });

    it('parses hour-only 12-hour formats and single-letter a/p suffixes', () => {
      expect(parseTimeToMinutes('7 PM')).toBe(19 * 60);
      expect(parseTimeToMinutes('7pm')).toBe(19 * 60);
      expect(parseTimeToMinutes('7p')).toBe(19 * 60);
      expect(parseTimeToMinutes('7a')).toBe(7 * 60);
      expect(parseTimeToMinutes('12am')).toBe(0);
      expect(parseTimeToMinutes('12pm')).toBe(12 * 60);
      expect(parseTimeToMinutes('9 AM')).toBe(9 * 60);
      expect(parseTimeToMinutes('7:30p')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('7:30a')).toBe(7 * 60 + 30);
    });

    it('parses single-digit minutes, dotted a.m./p.m., and dot or colon separators', () => {
      expect(parseTimeToMinutes('7:5 PM')).toBe(19 * 60 + 5);
      expect(parseTimeToMinutes('7:30 a.m.')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('7:30 p.m.')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('7:30 A.M.')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('7 : 30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('7: 30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('7.30 PM')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('7.30 pm')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('14.30')).toBe(14 * 60 + 30);
      expect(parseTimeToMinutes('14 : 30')).toBe(14 * 60 + 30);
    });

    it('rejects invalid 12-hour values', () => {
      expect(parseTimeToMinutes('13:00 PM')).toBeNull();
      expect(parseTimeToMinutes('14:30 AM')).toBeNull();
      expect(parseTimeToMinutes('12:60 PM')).toBeNull();
      expect(parseTimeToMinutes('12:85 PM')).toBeNull();
      expect(parseTimeToMinutes('99:99 PM')).toBeNull();
    });

    it('parses standard 24-hour formats and rejects ambiguous decimal numbers', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('07:30')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('7:30')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('14:30')).toBe(14 * 60 + 30);
      expect(parseTimeToMinutes('14:30:45')).toBe(14 * 60 + 30);
      expect(parseTimeToMinutes('23:59')).toBe(23 * 60 + 59);
      expect(parseTimeToMinutes('24:00')).toBe(0);

      // Decimals without time context are rejected
      expect(parseTimeToMinutes('1.5')).toBeNull();
    });

    it('parses compact military time', () => {
      expect(parseTimeToMinutes('0730')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('1930')).toBe(19 * 60 + 30);
      expect(parseTimeToMinutes('0000')).toBe(0);
      expect(parseTimeToMinutes('2359')).toBe(23 * 60 + 59);
      expect(parseTimeToMinutes('0730h')).toBe(7 * 60 + 30);
      expect(parseTimeToMinutes('1930h')).toBe(19 * 60 + 30);
    });

    it('rejects invalid 24-hour values', () => {
      expect(parseTimeToMinutes('25:00')).toBeNull();
      expect(parseTimeToMinutes('24:01')).toBeNull();
      expect(parseTimeToMinutes('14:60')).toBeNull();
      expect(parseTimeToMinutes('99:99')).toBeNull();
    });

    it('parses ISO 8601 wall-clock format accurately without engine timezone bugs', () => {
      expect(parseTimeToMinutes('2026-10-12T14:30:00')).toBe(14 * 60 + 30);
      expect(parseTimeToMinutes('2026-10-12 09:15:00')).toBe(9 * 60 + 15);
      expect(parseTimeToMinutes('2026/10/12 14:30')).toBe(14 * 60 + 30);
      expect(parseTimeToMinutes('2026-10-12t14:30:00')).toBe(14 * 60 + 30);
    });

    it('rejects arbitrary words containing letter T', () => {
      expect(parseTimeToMinutes('MEETING')).toBeNull();
      expect(parseTimeToMinutes('TRAIN')).toBeNull();
      expect(parseTimeToMinutes('TODAY')).toBeNull();
      expect(parseTimeToMinutes('TEST')).toBeNull();
    });

    it('handles epoch timestamps accurately distinguishing seconds from milliseconds', () => {
      const epochSec = 1728734890;
      const expectedDate = new Date(epochSec * 1000);
      const expectedMinutes = expectedDate.getHours() * 60 + expectedDate.getMinutes();
      expect(parseTimeToMinutes(String(epochSec))).toBe(expectedMinutes);

      const epochMs = 1728734890000;
      expect(parseTimeToMinutes(String(epochMs))).toBe(expectedMinutes);
    });
  });

  describe('normalizeTimeTo24H', () => {
    it('returns undefined for empty or invalid values (preventing data corruption)', () => {
      expect(normalizeTimeTo24H(null)).toBeUndefined();
      expect(normalizeTimeTo24H(undefined)).toBeUndefined();
      expect(normalizeTimeTo24H('')).toBeUndefined();
      expect(normalizeTimeTo24H('   ')).toBeUndefined();
      expect(normalizeTimeTo24H('invalid')).toBeUndefined();
      expect(normalizeTimeTo24H('25:00')).toBeUndefined();
      expect(normalizeTimeTo24H('MEETING')).toBeUndefined();
    });

    it('normalizes various formats to canonical HH:mm', () => {
      expect(normalizeTimeTo24H('7:30 PM')).toBe('19:30');
      expect(normalizeTimeTo24H('7.30 pm')).toBe('19:30');
      expect(normalizeTimeTo24H('730pm')).toBe('19:30');
      expect(normalizeTimeTo24H('7p')).toBe('19:00');
      expect(normalizeTimeTo24H('7pm')).toBe('19:00');
      expect(normalizeTimeTo24H('12:00 AM')).toBe('00:00');
      expect(normalizeTimeTo24H('12:00 PM')).toBe('12:00');
      expect(normalizeTimeTo24H('noon')).toBe('12:00');
      expect(normalizeTimeTo24H('midnight')).toBe('00:00');
      expect(normalizeTimeTo24H('7:30')).toBe('07:30');
      expect(normalizeTimeTo24H('19:30')).toBe('19:30');
      expect(normalizeTimeTo24H('24:00')).toBe('00:00');
      expect(normalizeTimeTo24H('⏰ 08:15 AM')).toBe('08:15');
    });
  });

  describe('formatTimeTo12H', () => {
    it('returns empty string for empty or invalid inputs', () => {
      expect(formatTimeTo12H(null)).toBe('');
      expect(formatTimeTo12H(undefined)).toBe('');
      expect(formatTimeTo12H('')).toBe('');
      expect(formatTimeTo12H('   ')).toBe('');
      expect(formatTimeTo12H('invalid')).toBe('');
      expect(formatTimeTo12H('25:00')).toBe('');
    });

    it('formats 24-hour and other formats to clean 12-hour representation', () => {
      expect(formatTimeTo12H('19:30')).toBe('7:30 PM');
      expect(formatTimeTo12H('00:00')).toBe('12:00 AM');
      expect(formatTimeTo12H('12:00')).toBe('12:00 PM');
      expect(formatTimeTo12H('07:05')).toBe('7:05 AM');
      expect(formatTimeTo12H('7pm')).toBe('7:00 PM');
      expect(formatTimeTo12H('7p')).toBe('7:00 PM');
      expect(formatTimeTo12H('7:30 PM')).toBe('7:30 PM');
      expect(formatTimeTo12H('7.30 pm')).toBe('7:30 PM');
      expect(formatTimeTo12H('noon')).toBe('12:00 PM');
      expect(formatTimeTo12H('midnight')).toBe('12:00 AM');
      expect(formatTimeTo12H('⏰ 14:45')).toBe('2:45 PM');
    });

    it('supports padded hour when padHour is true', () => {
      expect(formatTimeTo12H('07:30', true)).toBe('07:30 AM');
      expect(formatTimeTo12H('19:30', true)).toBe('07:30 PM');
      expect(formatTimeTo12H('00:00', true)).toBe('12:00 AM');
    });
  });

  describe('formatTimeRange', () => {
    it('returns "All Day" when isAllDay is true', () => {
      expect(formatTimeRange('09:00', '17:00', true)).toBe('All Day');
      expect(formatTimeRange(null, null, true)).toBe('All Day');
    });

    it('returns "All Day" when both start and end are missing and isAllDay not false', () => {
      expect(formatTimeRange(null, null)).toBe('All Day');
      expect(formatTimeRange('', '')).toBe('All Day');
      expect(formatTimeRange('   ', '   ')).toBe('All Day');
    });

    it('returns empty string when isAllDay is false and both times are missing', () => {
      expect(formatTimeRange(null, null, false)).toBe('');
      expect(formatTimeRange('', '', false)).toBe('');
    });

    it('does NOT falsely label corrupted inputs as "All Day"', () => {
      expect(formatTimeRange('invalid_start', 'invalid_end')).toBe('');
      expect(formatTimeRange('bad_time', null)).toBe('');
      expect(formatTimeRange('09:00', 'corrupt_end')).toBe('');
      expect(formatTimeRange('corrupt_start', '17:00')).toBe('');
    });

    it('formats start-only times properly', () => {
      expect(formatTimeRange('09:00', null)).toBe('9:00 AM');
      expect(formatTimeRange('09:00', '')).toBe('9:00 AM');
      expect(formatTimeRange('09:00', '   ')).toBe('9:00 AM');
    });

    it('formats end-only times as deadlines without false "All Day"', () => {
      expect(formatTimeRange(null, '17:00')).toBe('Until 5:00 PM');
      expect(formatTimeRange('', '17:00')).toBe('Until 5:00 PM');
      expect(formatTimeRange('   ', '17:00')).toBe('Until 5:00 PM');
    });

    it('formats standard start and end ranges with en-dash or custom separator', () => {
      expect(formatTimeRange('09:00', '17:00')).toBe('9:00 AM – 5:00 PM');
      expect(formatTimeRange('9:00 AM', '5:00 PM')).toBe('9:00 AM – 5:00 PM');
      expect(formatTimeRange('09:00', '17:00', false, false, ' - ')).toBe('9:00 AM - 5:00 PM');
    });

    it('collapses identical start and end times to single time', () => {
      expect(formatTimeRange('10:00', '10:00')).toBe('10:00 AM');
    });

    it('detects and formats overnight shifts crossing midnight with (+1d)', () => {
      expect(formatTimeRange('22:00', '06:00')).toBe('10:00 PM – 6:00 AM (+1d)');
      expect(formatTimeRange('22:00', '06:00', false, true)).toBe('10:00 PM – 6:00 AM (+1d)');
      expect(formatTimeRange('10:00', '10:00', false, true)).toBe('10:00 AM – 10:00 AM (+1d)');
    });
  });

  describe('calculateDurationMinutes & formatDurationMinutes', () => {
    it('calculates duration within the same day', () => {
      expect(calculateDurationMinutes('09:00', '17:00')).toBe(8 * 60);
      expect(calculateDurationMinutes('10:15', '11:45')).toBe(90);
    });

    it('calculates duration for overnight intervals', () => {
      expect(calculateDurationMinutes('22:00', '06:00')).toBe(480);
      expect(calculateDurationMinutes('23:30', '01:30', true)).toBe(120);
    });

    it('rejects end before start if isOvernight is explicitly false', () => {
      expect(calculateDurationMinutes('22:00', '06:00', false)).toBeNull();
    });

    it('returns null for unparseable inputs', () => {
      expect(calculateDurationMinutes(null, '17:00')).toBeNull();
      expect(calculateDurationMinutes('09:00', null)).toBeNull();
      expect(calculateDurationMinutes('bad', '17:00')).toBeNull();
    });

    it('formats duration minutes to clean string', () => {
      expect(formatDurationMinutes(90)).toBe('1h 30m');
      expect(formatDurationMinutes(60)).toBe('1h');
      expect(formatDurationMinutes(45)).toBe('45m');
      expect(formatDurationMinutes(0)).toBe('0m');
    });
  });

  describe('addMinutesToTime', () => {
    it('adds minutes within the same day', () => {
      const res = addMinutesToTime('10:00', 30);
      expect(res).toEqual({ time: '10:30', isOvernight: false });
    });

    it('handles wrapping past midnight into next day', () => {
      const res = addMinutesToTime('23:30', 45);
      expect(res).toEqual({ time: '00:15', isOvernight: true });
    });

    it('handles subtracting minutes within same day', () => {
      const res = addMinutesToTime('10:00', -60);
      expect(res).toEqual({ time: '09:00', isOvernight: false });
    });

    it('safely falls back to default time on unparseable input without crashing', () => {
      expect(addMinutesToTime('invalid', 30)).toEqual({ time: '10:00', isOvernight: false });
      expect(addMinutesToTime(null, 30, '09:00')).toEqual({ time: '09:00', isOvernight: false });
    });
  });

  describe('compareTimes', () => {
    it('sorts times in chronological order', () => {
      expect(compareTimes('09:00', '10:00')).toBeLessThan(0);
      expect(compareTimes('10:00', '09:00')).toBeGreaterThan(0);
      expect(compareTimes('10:00', '10:00')).toBe(0);
    });

    it('pushes invalid or null times to the end', () => {
      expect(compareTimes('09:00', null)).toBeLessThan(0);
      expect(compareTimes(null, '09:00')).toBeGreaterThan(0);
      expect(compareTimes('invalid', '10:00')).toBeGreaterThan(0);
    });
  });

  describe('isTimeValid', () => {
    it('returns true for valid times and false for invalid ones', () => {
      expect(isTimeValid('14:30')).toBe(true);
      expect(isTimeValid('7:30 PM')).toBe(true);
      expect(isTimeValid('7p')).toBe(true);
      expect(isTimeValid('noon')).toBe(true);
      expect(isTimeValid('invalid')).toBe(false);
      expect(isTimeValid(null)).toBe(false);
      expect(isTimeValid('25:00')).toBe(false);
    });
  });
});
