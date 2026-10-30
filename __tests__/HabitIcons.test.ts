import {
  getHabitIconDetails,
  suggestHabitIcon,
  getHabitIconBackground,
  extractLeadingEmoji,
  DEFAULT_FALLBACK_ICON,
  DEFAULT_FALLBACK_BG,
  HABIT_ICON_PRESETS,
  HABIT_ICON_PATTERNS,
} from '../src/utils/habitIcons';

describe('Habit Icon Utilities (src/utils/habitIcons.ts)', () => {
  describe('Safety & Defensive Handling', () => {
    it('returns default fallback icon and bg when habit is null or undefined without throwing', () => {
      const resNull = getHabitIconDetails(null as any);
      expect(resNull).toEqual({ bg: DEFAULT_FALLBACK_BG, icon: DEFAULT_FALLBACK_ICON });

      const resUndefined = getHabitIconDetails(undefined as any);
      expect(resUndefined).toEqual({ bg: DEFAULT_FALLBACK_BG, icon: DEFAULT_FALLBACK_ICON });
    });

    it('safely handles non-object habits without crashing', () => {
      expect(getHabitIconDetails('' as any)).toEqual({
        bg: DEFAULT_FALLBACK_BG,
        icon: DEFAULT_FALLBACK_ICON,
      });
      expect(getHabitIconDetails(12345 as any)).toEqual({
        bg: DEFAULT_FALLBACK_BG,
        icon: DEFAULT_FALLBACK_ICON,
      });
    });

    it('handles empty habit object with undefined fields safely', () => {
      const res = getHabitIconDetails({});
      expect(res).toEqual({ bg: DEFAULT_FALLBACK_BG, icon: DEFAULT_FALLBACK_ICON });
    });

    it('handles non-string habit name, icon, or color safely', () => {
      const res = getHabitIconDetails({
        name: null,
        icon: 123 as any,
        color: false as any,
        description: undefined,
      });
      expect(res).toEqual({ bg: DEFAULT_FALLBACK_BG, icon: DEFAULT_FALLBACK_ICON });
    });

    it('trims whitespace-only custom icon and falls through to heuristics', () => {
      const res = getHabitIconDetails({
        name: 'Morning jog',
        icon: '   ',
      });
      expect(res.icon).toBe('👟');
    });
  });

  describe('Color & Background Opacity Formatting', () => {
    it('safely applies opacity to standard 6-digit hex color', () => {
      const res = getHabitIconDetails({
        name: 'Gym Workout',
        color: '#FF6B00',
      });
      expect(res.bg).toBe('rgba(255, 107, 0, 0.18)');
    });

    it('safely applies opacity to 3-digit shorthand hex (#F00)', () => {
      const res = getHabitIconDetails({
        name: 'Gym Workout',
        color: '#F00',
      });
      expect(res.bg).toBe('rgba(255, 0, 0, 0.18)');
    });

    it('safely handles rgb(...) colors without generating broken CSS like rgb(...)22', () => {
      const res = getHabitIconDetails({
        name: 'Morning Meditate',
        color: 'rgb(59, 130, 246)',
      });
      expect(res.bg).toBe('rgba(59, 130, 246, 0.18)');
    });

    it('safely handles rgba(...) colors updating the alpha channel', () => {
      const res = getHabitIconDetails({
        name: 'Read Books',
        color: 'rgba(16, 185, 129, 0.9)',
      });
      expect(res.bg).toBe('rgba(16, 185, 129, 0.18)');
    });

    it('respects fallbackSurfaceHighlight when habit color is absent', () => {
      const highlight = 'rgba(255, 255, 255, 0.08)';
      const res = getHabitIconDetails(
        {
          name: 'Custom Unmatched Routine',
          icon: '🎸',
        },
        highlight
      );
      expect(res.bg).toBe(highlight);
      expect(res.icon).toBe('🎸');
    });
  });

  describe('User Custom Icon Preservation', () => {
    it('honors user custom icon when distinct from generic target 🎯', () => {
      const res = getHabitIconDetails({
        name: 'Daily Gym Routine',
        icon: '🎸',
      });
      expect(res.icon).toBe('🎸');
    });

    it('falls back to pattern background when custom icon matches a known pattern', () => {
      const res = getHabitIconDetails({
        name: 'Some generic task',
        icon: '💪',
      });
      expect(res.icon).toBe('💪');
      expect(res.bg).toBe('rgba(239, 68, 68, 0.18)');
    });

    it('trims leading and trailing spaces from user custom icon', () => {
      const res = getHabitIconDetails({
        name: 'Art Session',
        icon: '  🎨  ',
      });
      expect(res.icon).toBe('🎨');
      expect(res.bg).toBe('rgba(236, 72, 153, 0.18)');
    });
  });

  describe('Leading Emoji Extraction from Habit Title', () => {
    it('extracts leading emoji when habit.icon is default or undefined', () => {
      const res = getHabitIconDetails({
        name: '🏃 5km Morning run',
        icon: DEFAULT_FALLBACK_ICON,
      });
      expect(res.icon).toBe('🏃');
    });

    it('extracts compound emoji with skin-tone modifiers and gender zero-width joiners without truncation', () => {
      const resTone = getHabitIconDetails({
        name: '💪🏽 Heavy lifting session',
      });
      expect(resTone.icon).toBe('💪🏽');

      const resWoman = getHabitIconDetails({
        name: '🏃‍♀️ 10k Marathon prep',
      });
      expect(resWoman.icon).toBe('🏃‍♀️');

      const resManYoga = getHabitIconDetails({
        name: '🧘‍♂️ Daily breathwork',
      });
      expect(resManYoga.icon).toBe('🧘‍♂️');
    });

    it('extracts leading emoji past markdown checkbox or bullet numbers', () => {
      const resCheckbox = getHabitIconDetails({
        name: '- [ ] 💧 Drink 2L water',
      });
      expect(resCheckbox.icon).toBe('💧');

      const resNumbered = getHabitIconDetails({
        name: '1. 🧘 15m Vipassana',
      });
      expect(resNumbered.icon).toBe('🧘');
    });

    it('ignores leading generic 🎯 emoji allowing deeper heuristic matching', () => {
      const res = getHabitIconDetails({
        name: '🎯 Daily Workout',
      });
      expect(res.icon).toBe('💪');
    });
  });

  describe('False-Positive Substring Collision Prevention', () => {
    it('does NOT match "read" (📚) inside "treadmill" - assigns running (👟)', () => {
      const res = getHabitIconDetails({
        name: 'Treadmill 30 mins',
      });
      expect(res.icon).toBe('👟');
      expect(res.icon).not.toBe('📚');
    });

    it('does NOT match "read" (📚) inside "bread" - assigns cooking (🍳)', () => {
      const res = getHabitIconDetails({
        name: 'Bake sourdough bread',
      });
      expect(res.icon).toBe('🍳');
      expect(res.icon).not.toBe('📚');
    });

    it('does NOT match "read" (📚) inside "ready"', () => {
      const res = getHabitIconDetails({
        name: 'Get ready for morning routine',
      });
      expect(res.icon).not.toBe('📚');
      expect(res.icon).toBe('☀️');
    });

    it('does NOT match "eat" (🥗) inside "repeat"', () => {
      const res = getHabitIconDetails({
        name: 'Repeat positive affirmations',
      });
      expect(res.icon).not.toBe('🥗');
    });

    it('does NOT match "eat" (🥗) inside "heater"', () => {
      const res = getHabitIconDetails({
        name: 'Turn off heater before bed',
      });
      expect(res.icon).not.toBe('🥗');
      expect(res.icon).toBe('🌙');
    });

    it('does NOT match "show" (🎬) inside "shower" - assigns hygiene (🚿)', () => {
      const res = getHabitIconDetails({
        name: 'Cold shower 5m',
      });
      expect(res.icon).toBe('🚿');
      expect(res.icon).not.toBe('🎬');
    });

    it('does NOT match "run" (👟) inside "brunch"', () => {
      const res = getHabitIconDetails({
        name: 'Healthy Sunday brunch',
      });
      expect(res.icon).not.toBe('👟');
      expect(res.icon).toBe('🥗');
    });

    it('does NOT match "fit" (💪) inside "profit"', () => {
      const res = getHabitIconDetails({
        name: 'Review quarterly profit and expenses',
      });
      expect(res.icon).not.toBe('💪');
      expect(res.icon).toBe('💰');
    });

    it('does NOT match "rest" (🌙) inside "interest"', () => {
      const res = getHabitIconDetails({
        name: 'Pay loan interest and save money',
      });
      expect(res.icon).not.toBe('🌙');
      expect(res.icon).toBe('💰');
    });

    it('does NOT match "rest" (🌙) inside "restaurant"', () => {
      const res = getHabitIconDetails({
        name: 'Order dinner from restaurant',
      });
      expect(res.icon).not.toBe('🌙');
      expect(res.icon).toBe('🍳');
    });
  });

  describe('Multi-Word Phrase Precedence', () => {
    it('prioritizes "work out" (💪 Gym) over "work" (💼 Job)', () => {
      const res = getHabitIconDetails({
        name: 'Work out for 45 minutes',
      });
      expect(res.icon).toBe('💪');
      expect(res.icon).not.toBe('💼');
    });

    it('properly assigns "work" to career icon (💼) when not a workout', () => {
      const res = getHabitIconDetails({
        name: 'Work on client presentation',
      });
      expect(res.icon).toBe('💼');
    });

    it('matches "brush teeth" to oral hygiene (🪥)', () => {
      const res = getHabitIconDetails({
        name: 'Brush teeth and floss twice daily',
      });
      expect(res.icon).toBe('🪥');
    });

    it('matches "drink water" to hydration (🥛)', () => {
      const res = getHabitIconDetails({
        name: 'Drink water (2L target)',
      });
      expect(res.icon).toBe('🥛');
    });

    it('matches "save money" to financial (💰)', () => {
      const res = getHabitIconDetails({
        name: 'Save money into emergency fund',
      });
      expect(res.icon).toBe('💰');
    });

    it('matches "digital detox" to detox icon (📵)', () => {
      const res = getHabitIconDetails({
        name: 'Digital detox after 9 PM',
      });
      expect(res.icon).toBe('📵');
    });
  });

  describe('Description and Category Secondary Fallbacks', () => {
    it('matches pattern from multiline habit name with subtask bullet notes', () => {
      const res = getHabitIconDetails({
        name: '1. Meditate for 10 minutes\n2. Journal gratitude\n3. Drink water',
      });
      expect(res.icon).toBe('🧘');
    });

    it('matches pattern from description when habit name is generic', () => {
      const res = getHabitIconDetails({
        name: 'Daily Goal #1',
        description: '15 minutes meditation and mindfulness breathing',
      });
      expect(res.icon).toBe('🧘');
    });

    it('matches pattern from category when name and description are generic', () => {
      const res = getHabitIconDetails({
        name: 'Daily Habit',
        description: 'Do consistently every day',
        category: 'Fitness & Gym',
      });
      expect(res.icon).toBe('💪');
    });
  });

  describe('Utility Functions', () => {
    describe('suggestHabitIcon', () => {
      it('returns suggested icon for direct strings', () => {
        expect(suggestHabitIcon('Morning walk')).toBe('👟');
        expect(suggestHabitIcon('Yoga stretching')).toBe('🤸');
        expect(suggestHabitIcon('Write diary')).toBe('✍️');
        expect(suggestHabitIcon('Take vitamins')).toBe('💊');
        expect(suggestHabitIcon('Play guitar')).toBe('🎵');
        expect(suggestHabitIcon('Water the plants')).toBe('🌱');
        expect(suggestHabitIcon('Clean the bedroom')).toBe('🧹');
      });

      it('returns fallback icon when no match', () => {
        expect(suggestHabitIcon('Random unidentified task')).toBe(DEFAULT_FALLBACK_ICON);
        expect(suggestHabitIcon('', '⭐')).toBe('⭐');
        expect(suggestHabitIcon(null, '⭐')).toBe('⭐');
      });
    });

    describe('extractLeadingEmoji', () => {
      it('extracts emojis accurately', () => {
        expect(extractLeadingEmoji('🏃 10K Run')).toBe('🏃');
        expect(extractLeadingEmoji('✈️ Trip to Tokyo')).toBe('✈️');
        expect(extractLeadingEmoji('No emoji here')).toBeNull();
        expect(extractLeadingEmoji('')).toBeNull();
        expect(extractLeadingEmoji(null)).toBeNull();
      });
    });

    describe('getHabitIconBackground', () => {
      it('uses custom color with opacity if provided', () => {
        expect(getHabitIconBackground('💪', '#EF4444')).toBe('rgba(239, 68, 68, 0.18)');
      });

      it('uses fallback highlight if custom color is absent', () => {
        expect(getHabitIconBackground('💪', null, 'rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
      });

      it('resolves matching pattern defaultBg if icon is in patterns list', () => {
        expect(getHabitIconBackground('🧘')).toBe('rgba(16, 185, 129, 0.18)');
      });

      it('falls back to DEFAULT_FALLBACK_BG for unknown icon', () => {
        expect(getHabitIconBackground('🚀')).toBe(DEFAULT_FALLBACK_BG);
      });
    });

    describe('HABIT_ICON_PRESETS and HABIT_ICON_PATTERNS', () => {
      it('has valid non-empty presets list with unique icons', () => {
        expect(HABIT_ICON_PRESETS.length).toBeGreaterThan(20);
        expect(HABIT_ICON_PRESETS).toContain('🎯');
        expect(HABIT_ICON_PRESETS).toContain('💪');
        expect(HABIT_ICON_PRESETS).toContain('🪥');
        expect(HABIT_ICON_PRESETS).toContain('💧');
      });

      it('all patterns have valid icons, background RGBA values, and keywords', () => {
        for (const pattern of HABIT_ICON_PATTERNS) {
          expect(pattern.icon.length).toBeGreaterThan(0);
          expect(pattern.defaultBg).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/);
          expect(pattern.keywords.length).toBeGreaterThan(0);
        }
      });
    });
  });
});
