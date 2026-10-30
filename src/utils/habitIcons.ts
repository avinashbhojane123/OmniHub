import { Habit, HabitWithStreak } from '../types';
import { withOpacity } from './color';

export interface HabitIconPattern {
  keywords: string[];
  icon: string;
  defaultBg: string;
}

export type HabitLike = Omit<Partial<HabitWithStreak>, 'name' | 'icon' | 'color' | 'description'> & {
  name?: string | null;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  category?: string | null;
  [key: string]: any;
};

export const DEFAULT_FALLBACK_ICON = '🎯';
export const DEFAULT_FALLBACK_BG = 'rgba(255, 107, 0, 0.14)';

export const HABIT_ICON_PATTERNS: HabitIconPattern[] = [
  // 1. Sleep & Rest
  {
    keywords: ['sleep', 'rest', 'nap', 'bed', 'bedtime', 'night', 'snooze', 'slumber', 'sleep early', 'go to bed'],
    icon: '🌙',
    defaultBg: 'rgba(139, 92, 246, 0.18)',
  },
  // 2. Teeth & Oral Hygiene
  {
    keywords: ['brush teeth', 'brushing teeth', 'teeth', 'tooth', 'floss', 'flossing', 'dental', 'mouthwash'],
    icon: '🪥',
    defaultBg: 'rgba(6, 182, 212, 0.18)',
  },
  // 3. Shower, Bath & Personal Hygiene
  {
    keywords: [
      'cold shower',
      'take shower',
      'shower',
      'bath',
      'bathing',
      'skincare',
      'wash face',
      'hygiene',
      'shave',
      'grooming',
    ],
    icon: '🚿',
    defaultBg: 'rgba(56, 189, 248, 0.18)',
  },
  // 4. Gym, Workout & Strength (placed before job so 'work out' / 'workout' wins over 'work')
  {
    keywords: [
      'work out',
      'working out',
      'workout',
      'workouts',
      'gym',
      'fit',
      'exercise',
      'lift',
      'lifting',
      'strength',
      'training',
      'pushup',
      'pushups',
      'pullup',
      'pullups',
      'squat',
      'squats',
      'calisthenics',
      'crossfit',
      'dumbbell',
      'barbell',
      'kettlebell',
      'weights',
    ],
    icon: '💪',
    defaultBg: 'rgba(239, 68, 68, 0.18)',
  },
  // 5. Job & Career
  {
    keywords: [
      'job',
      'apply',
      'career',
      'resume',
      'interview',
      'work',
      'hire',
      'employment',
      'linkedin',
      'client',
      'office',
      'meeting',
    ],
    icon: '💼',
    defaultBg: 'rgba(59, 130, 246, 0.18)',
  },
  // 6. Devotion, Faith & Spiritual
  {
    keywords: [
      'devot',
      'pray',
      'prayer',
      'god',
      'spiritual',
      'spirituality',
      'upvas',
      'puja',
      'temple',
      'faith',
      'motivation',
      'worship',
      'church',
      'mosque',
    ],
    icon: '🙏',
    defaultBg: 'rgba(245, 158, 11, 0.18)',
  },
  // 7. News & Journalism
  {
    keywords: [
      'news',
      'article',
      'feed',
      'paper',
      'newspaper',
      'journalism',
      'newsletter',
      'editorial',
      'headline',
    ],
    icon: '📰',
    defaultBg: 'rgba(14, 165, 233, 0.18)',
  },
  // 8. Meditation & Mindfulness
  {
    keywords: [
      'meditat',
      'relax',
      'breathe',
      'breathing',
      'mindful',
      'mindfulness',
      'calm',
      'zen',
      'peace',
      'headspace',
    ],
    icon: '🧘',
    defaultBg: 'rgba(16, 185, 129, 0.18)',
  },
  // 9. Stretch, Yoga & Pilates
  {
    keywords: ['stretch', 'stretching', 'yoga', 'flex', 'flexibility', 'pilates', 'mobility', 'asana'],
    icon: '🤸',
    defaultBg: 'rgba(236, 72, 153, 0.18)',
  },
  // 10. Water & Hydration
  {
    keywords: [
      'drink water',
      'water',
      'hydrat',
      'hydration',
      'fluid',
      'hygienic',
      '2l water',
      '8 glasses',
      'electrolytes',
    ],
    icon: '🥛',
    defaultBg: 'rgba(56, 189, 248, 0.18)',
  },
  // 11. Walking, Running & Cardio
  {
    keywords: [
      'walk',
      'walking',
      'run',
      'running',
      'runner',
      'step',
      'steps',
      '10k steps',
      'jog',
      'jogging',
      'hike',
      'hiking',
      'cardio',
      'treadmill',
      'marathon',
      'sprint',
    ],
    icon: '👟',
    defaultBg: 'rgba(249, 115, 22, 0.18)',
  },
  // 12. Cycling & Biking
  {
    keywords: ['cycle', 'cycling', 'bike', 'biking', 'bicycle', 'ride', 'riding', 'spin class'],
    icon: '🚴',
    defaultBg: 'rgba(245, 158, 11, 0.18)',
  },
  // 13. Vitamins, Medication & Health
  {
    keywords: [
      'vitamin',
      'vitamins',
      'supplement',
      'supplements',
      'medicine',
      'medication',
      'pill',
      'pills',
      'creatine',
      'omega',
    ],
    icon: '💊',
    defaultBg: 'rgba(239, 68, 68, 0.18)',
  },
  // 14. Healthy Nutrition & Diet
  {
    keywords: [
      'eat',
      'diet',
      'meal',
      'nutrition',
      'healthy',
      'salad',
      'greens',
      'vegetables',
      'calories',
      'macro',
      'fasting',
      'intermittent fasting',
    ],
    icon: '🥗',
    defaultBg: 'rgba(16, 185, 129, 0.18)',
  },
  // 15. Cooking & Baking
  {
    keywords: [
      'cook',
      'cooking',
      'kitchen',
      'bake',
      'baking',
      'recipe',
      'food',
      'chef',
      'meal prep',
      'breakfast',
      'dinner',
      'lunch',
    ],
    icon: '🍳',
    defaultBg: 'rgba(249, 115, 22, 0.18)',
  },
  // 16. Reading, Learning & Studying
  {
    keywords: [
      'read',
      'reading',
      'book',
      'books',
      'study',
      'studying',
      'learn',
      'learning',
      'course',
      'textbook',
      'homework',
      'exam',
    ],
    icon: '📚',
    defaultBg: 'rgba(59, 130, 246, 0.18)',
  },
  // 17. Journaling & Writing
  {
    keywords: [
      'journal',
      'journaling',
      'diary',
      'write',
      'writing',
      'gratitude',
      'gratitude journal',
      'essay',
      'blog',
      'author',
    ],
    icon: '✍️',
    defaultBg: 'rgba(139, 92, 246, 0.18)',
  },
  // 18. Coding & Tech
  {
    keywords: [
      'code',
      'coding',
      'program',
      'programming',
      'software',
      'developer',
      'dev',
      'build',
      'github',
      'debug',
      'algorithm',
      'tech',
    ],
    icon: '💻',
    defaultBg: 'rgba(99, 102, 241, 0.18)',
  },
  // 19. Finance, Savings & Budget
  {
    keywords: [
      'save money',
      'saving money',
      'budget',
      'budgeting',
      'finance',
      'finances',
      'money',
      'save',
      'saving',
      'savings',
      'expenses',
      'invest',
      'investing',
      'stocks',
    ],
    icon: '💰',
    defaultBg: 'rgba(16, 185, 129, 0.18)',
  },
  // 20. Morning Routine & Sunlight
  {
    keywords: ['morning', 'sunlight', 'sunrise', 'wake up', 'wake early', 'morning routine', 'morning sun'],
    icon: '☀️',
    defaultBg: 'rgba(245, 158, 11, 0.18)',
  },
  // 21. Movies, Shows & Entertainment
  {
    keywords: [
      'movie',
      'movies',
      'series',
      'film',
      'cinema',
      'watch',
      'tablet',
      'netflix',
      'show',
      'shows',
      'tv show',
      'documentary',
    ],
    icon: '🎬',
    defaultBg: 'rgba(168, 85, 247, 0.18)',
  },
  // 22. Music, Instruments & Podcasts
  {
    keywords: ['music', 'instrument', 'guitar', 'piano', 'singing', 'song', 'listen', 'podcast', 'audiobook'],
    icon: '🎵',
    defaultBg: 'rgba(168, 85, 247, 0.18)',
  },
  // 23. Cleaning & Chores
  {
    keywords: [
      'clean',
      'cleaning',
      'tidy',
      'organize',
      'organizing',
      'chore',
      'chores',
      'laundry',
      'vacuum',
      'dishes',
      'dust',
      'sweep',
    ],
    icon: '🧹',
    defaultBg: 'rgba(14, 165, 233, 0.18)',
  },
  // 24. Pets & Animal Care
  {
    keywords: ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'walk dog'],
    icon: '🐾',
    defaultBg: 'rgba(249, 115, 22, 0.18)',
  },
  // 25. Plants & Gardening
  {
    keywords: ['plant', 'plants', 'garden', 'gardening', 'water plants', 'flowers'],
    icon: '🌱',
    defaultBg: 'rgba(16, 185, 129, 0.18)',
  },
  // 26. Art & Creativity
  {
    keywords: ['art', 'draw', 'drawing', 'paint', 'painting', 'sketch', 'sketching', 'design', 'creative', 'illustration'],
    icon: '🎨',
    defaultBg: 'rgba(236, 72, 153, 0.18)',
  },
  // 27. Languages & Speech
  {
    keywords: ['language', 'languages', 'duolingo', 'vocab', 'vocabulary', 'spanish', 'french', 'german', 'speak', 'fluency'],
    icon: '🗣️',
    defaultBg: 'rgba(14, 165, 233, 0.18)',
  },
  // 28. Digital Wellbeing & Screen Time
  {
    keywords: ['digital detox', 'screen time', 'detox', 'limit phone', 'no social media', 'no scroll', 'unplug'],
    icon: '📵',
    defaultBg: 'rgba(239, 68, 68, 0.18)',
  },
  // 29. Quitting Bad Habits & Sobriety
  {
    keywords: ['quit smoking', 'no smoking', 'sober', 'sobriety', 'no alcohol', 'stop smoking', 'quit sugar'],
    icon: '🚭',
    defaultBg: 'rgba(107, 114, 128, 0.18)',
  },
  // 30. Travel & Vacations
  {
    keywords: ['travel', 'trip', 'explore', 'vacation', 'sunday', 'outing', 'flight', 'airport', 'journey'],
    icon: '✈️',
    defaultBg: 'rgba(6, 182, 212, 0.18)',
  },
];

/** Curated preset icons for UI selection pickers */
export const HABIT_ICON_PRESETS = [
  '🎯', // Target / Goal
  '💪', // Gym / Workout
  '👟', // Running / Walking
  '🧘', // Meditation / Mindfulness
  '📚', // Reading / Study
  '🥛', // Water / Drink
  '💧', // Hydration / Drop
  '🪥', // Dental / Teeth
  '🚿', // Shower / Bath
  '🌙', // Sleep / Night
  '🛌', // Bedtime / Rest
  '🥗', // Nutrition / Healthy Food
  '🍳', // Cooking / Kitchen
  '☀️', // Morning / Sunlight
  '✍️', // Journaling / Writing
  '💰', // Budget / Money
  '💻', // Coding / Tech
  '💼', // Work / Career
  '🚴', // Cycling / Bike
  '🤸', // Yoga / Stretch
  '💊', // Vitamins / Medication
  '🌱', // Plants / Garden
  '🐾', // Pets / Animals
  '🎨', // Art / Creative
  '🎵', // Music / Audio
  '🧹', // Cleaning / Chores
  '✈️', // Travel / Outing
  '🙏', // Devotion / Spiritual
  '📰', // News / Reading
  '🎬', // Movies / Entertainment
  '📵', // Digital Detox
  '🚭', // Quit Bad Habits
] as const;

/**
 * Unicode property escape regex for detecting leading emoji symbols,
 * including skin-tone modifiers, zero-width joiners, and gender sequences.
 */
const EMOJI_PREFIX_REGEX = /^(\p{Extended_Pictographic}(?:[\uFE00-\uFE0F]|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)/u;

/**
 * Escapes special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pre-indexed map of icon emojis to their default background tint for O(1) retrieval.
 */
const ICON_BG_MAP = new Map<string, string>(
  HABIT_ICON_PATTERNS.map((p) => [p.icon, p.defaultBg])
);

/**
 * Strict boundary regex mapping for common short words to avoid false positive
 * substring collisions (e.g., 'read' in 'treadmill' or 'bread', 'eat' in 'repeat' or 'heater').
 */
const STRICT_WORD_REGEXES: Record<string, RegExp> = {
  eat: /\b(eat|eats|eating|eaten)\b/i,
  read: /\b(read|reads|reading|reader|readers)\b/i,
  rest: /\b(rest|rests|resting|rested)\b/i,
  run: /\b(run|runs|running|runner|runners)\b/i,
  show: /\b(show|shows|showing|showed)\b/i,
  fit: /\b(fit|fitness|fitted)\b/i,
  god: /\b(god|gods)\b/i,
  dev: /\b(dev|devs|developer|developers|developing|development)\b/i,
  hire: /\b(hire|hires|hiring|hired)\b/i,
  job: /\b(job|jobs)\b/i,
  bed: /\b(bed|beds|bedtime)\b/i,
  walk: /\b(walk|walks|walking|walker|walkers)\b/i,
  step: /\b(step|steps|stepping)\b/i,
  feed: /\b(feed|feeds|feeding)\b/i,
  paper: /\b(paper|papers|newspaper|newspapers)\b/i,
};

interface CompiledPattern {
  pattern: HabitIconPattern;
  phraseRegexes: RegExp[];
  wordRegexes: RegExp[];
}

/**
 * Pre-compiled regex cache for high-performance matching without regex allocation during render.
 */
const COMPILED_PATTERNS: CompiledPattern[] = HABIT_ICON_PATTERNS.map((pattern) => {
  const phraseRegexes: RegExp[] = [];
  const wordRegexes: RegExp[] = [];

  for (const kw of pattern.keywords) {
    const trimmed = kw.trim().toLowerCase();
    if (!trimmed) continue;

    if (trimmed.includes(' ')) {
      // Multi-word phrase with flexible whitespace, hyphens, and optional common articles/pronouns
      const phraseParts = trimmed
        .split(/\s+/)
        .map(escapeRegex)
        .join('[\\s-_]+(?:the|a|an|my|our)?[\\s-_]*');
      phraseRegexes.push(new RegExp(`\\b${phraseParts}\\b`, 'i'));
    } else if (STRICT_WORD_REGEXES[trimmed]) {
      wordRegexes.push(STRICT_WORD_REGEXES[trimmed]);
    } else {
      // Word stem matching at beginning of words
      wordRegexes.push(new RegExp(`\\b${escapeRegex(trimmed)}\\w*\\b`, 'i'));
    }
  }

  return { pattern, phraseRegexes, wordRegexes };
});

/**
 * Extracts a leading emoji from a text string if present (ignoring leading markdown bullet points / numbers).
 */
export function extractLeadingEmoji(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/^(\s*[-*+]\s*(\[[ xX]\])?|\s*\d+[.)])\s*/g, '').trim();
  const match = cleaned.match(EMOJI_PREFIX_REGEX);
  return match ? match[1] : null;
}

/**
 * Evaluates a single line or text snippet against compiled icon patterns.
 */
function findMatchingPatternInSnippet(snippet: string): HabitIconPattern | null {
  const cleaned = snippet
    .replace(/^(\s*[-*+]\s*(\[[ xX]\])?|\s*\d+[.)])\s*/g, ' ')
    .trim();
  if (!cleaned) return null;

  // 1. Check all multi-word phrases first to prioritize specific compound expressions
  for (const compiled of COMPILED_PATTERNS) {
    for (const phraseRegex of compiled.phraseRegexes) {
      if (phraseRegex.test(cleaned)) {
        return compiled.pattern;
      }
    }
  }

  // 2. Check token / word stem patterns in sequential pattern order
  for (const compiled of COMPILED_PATTERNS) {
    for (const wordRegex of compiled.wordRegexes) {
      if (wordRegex.test(cleaned)) {
        return compiled.pattern;
      }
    }
  }

  return null;
}

/**
 * Finds the first matching habit icon pattern for a given text snippet.
 * Prioritizes the primary title (first line) over nested subtask lines.
 */
function findMatchingPattern(text: string): HabitIconPattern | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Primary: Check the first/primary line first
  const firstLineMatch = findMatchingPatternInSnippet(lines[0]);
  if (firstLineMatch) {
    return firstLineMatch;
  }

  // Secondary: If first line was generic, evaluate remaining subtask lines
  for (let i = 1; i < lines.length; i++) {
    const match = findMatchingPatternInSnippet(lines[i]);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Resolves the appropriate background tint for a habit icon.
 */
export function getHabitIconBackground(
  icon?: string | null,
  customColor?: string | null,
  fallbackHighlight?: string
): string {
  if (customColor && typeof customColor === 'string' && customColor.trim()) {
    return withOpacity(customColor, 0.18);
  }

  if (fallbackHighlight && typeof fallbackHighlight === 'string' && fallbackHighlight.trim()) {
    return fallbackHighlight;
  }

  if (icon && typeof icon === 'string') {
    const trimmed = icon.trim();
    const patternBg = ICON_BG_MAP.get(trimmed);
    if (patternBg) {
      return patternBg;
    }
  }

  return DEFAULT_FALLBACK_BG;
}

/**
 * Suggests an icon emoji based on habit name or description text.
 */
export function suggestHabitIcon(
  text?: string | null,
  fallbackIcon: string = DEFAULT_FALLBACK_ICON
): string {
  if (!text || typeof text !== 'string') {
    return fallbackIcon;
  }

  const leading = extractLeadingEmoji(text);
  if (leading && leading !== DEFAULT_FALLBACK_ICON) {
    return leading;
  }

  const matched = findMatchingPattern(text);
  return matched ? matched.icon : fallbackIcon;
}

/**
 * Resolves the visual icon and background color tint for a habit.
 * Prioritizes user-configured custom icons, but falls back to smart keyword heuristics
 * if the icon is undefined, empty, or the default fallback target ('🎯').
 */
export function getHabitIconDetails(
  habit?: HabitLike | null,
  fallbackSurfaceHighlight?: string
): { bg: string; icon: string } {
  if (!habit || typeof habit !== 'object') {
    return {
      bg: fallbackSurfaceHighlight || DEFAULT_FALLBACK_BG,
      icon: DEFAULT_FALLBACK_ICON,
    };
  }

  const rawIcon = typeof habit.icon === 'string' ? habit.icon.trim() : '';

  // 1. If user selected a custom icon other than the generic default target 🎯, honor it
  if (rawIcon && rawIcon !== DEFAULT_FALLBACK_ICON) {
    return {
      bg: getHabitIconBackground(rawIcon, habit.color, fallbackSurfaceHighlight),
      icon: rawIcon,
    };
  }

  // 2. If habit name starts with an emoji, honor that emoji
  const habitName = typeof habit.name === 'string' ? habit.name : '';
  const leadingEmoji = extractLeadingEmoji(habitName);
  if (leadingEmoji && leadingEmoji !== DEFAULT_FALLBACK_ICON) {
    return {
      bg: getHabitIconBackground(leadingEmoji, habit.color, fallbackSurfaceHighlight),
      icon: leadingEmoji,
    };
  }

  // 3. Keyword heuristic matching against habit name
  if (habitName.trim()) {
    const matched = findMatchingPattern(habitName);
    if (matched) {
      return {
        bg: getHabitIconBackground(matched.icon, habit.color, fallbackSurfaceHighlight),
        icon: matched.icon,
      };
    }
  }

  // 4. Keyword heuristic matching against description or category
  const habitDesc = typeof habit.description === 'string' ? habit.description : '';
  const habitCategory = typeof habit.category === 'string' ? habit.category : '';
  const secondaryText = `${habitDesc} ${habitCategory}`.trim();
  if (secondaryText) {
    const matched = findMatchingPattern(secondaryText);
    if (matched) {
      return {
        bg: getHabitIconBackground(matched.icon, habit.color, fallbackSurfaceHighlight),
        icon: matched.icon,
      };
    }
  }

  // 5. Default fallback
  const resolvedIcon = rawIcon || DEFAULT_FALLBACK_ICON;
  return {
    bg: getHabitIconBackground(resolvedIcon, habit.color, fallbackSurfaceHighlight),
    icon: resolvedIcon,
  };
}
