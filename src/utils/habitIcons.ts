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
  { keywords: ['sleep', 'rest', 'nap', 'bed', 'bedtime', 'night', 'snooze', 'slumber', 'sleep early', 'go to bed'], icon: '🌙', defaultBg: 'rgba(139, 92, 246, 0.18)' },
  { keywords: ['brush teeth', 'brushing teeth', 'teeth', 'tooth', 'floss', 'flossing', 'dental', 'mouthwash'], icon: '🪥', defaultBg: 'rgba(6, 182, 212, 0.18)' },
  { keywords: ['cold shower', 'take shower', 'shower', 'bath', 'bathing', 'skincare', 'wash face', 'hygiene', 'shave', 'grooming'], icon: '🚿', defaultBg: 'rgba(56, 189, 248, 0.18)' },
  { keywords: ['work out', 'working out', 'workout', 'workouts', 'gym', 'fit', 'exercise', 'lift', 'lifting', 'strength', 'training', 'pushup', 'pushups', 'pullup', 'pullups', 'squat', 'squats', 'calisthenics', 'crossfit', 'dumbbell', 'barbell', 'kettlebell', 'weights'], icon: '💪', defaultBg: 'rgba(239, 68, 68, 0.18)' },
  { keywords: ['job', 'apply', 'career', 'resume', 'interview', 'work', 'hire', 'employment', 'linkedin', 'client', 'office', 'meeting'], icon: '💼', defaultBg: 'rgba(59, 130, 246, 0.18)' },
  { keywords: ['devot', 'pray', 'prayer', 'god', 'spiritual', 'spirituality', 'upvas', 'puja', 'temple', 'faith', 'motivation', 'worship', 'church', 'mosque'], icon: '🙏', defaultBg: 'rgba(245, 158, 11, 0.18)' },
  { keywords: ['news', 'article', 'feed', 'paper', 'newspaper', 'journalism', 'newsletter', 'editorial', 'headline'], icon: '📰', defaultBg: 'rgba(14, 165, 233, 0.18)' },
  { keywords: ['meditat', 'relax', 'breathe', 'breathing', 'mindful', 'mindfulness', 'calm', 'zen', 'peace', 'headspace'], icon: '🧘', defaultBg: 'rgba(16, 185, 129, 0.18)' },
  { keywords: ['stretch', 'stretching', 'yoga', 'flex', 'flexibility', 'pilates', 'mobility', 'asana'], icon: '🤸', defaultBg: 'rgba(236, 72, 153, 0.18)' },
  { keywords: ['drink water', 'water', 'hydrat', 'hydration', 'fluid', 'hygienic', '2l water', '8 glasses', 'electrolytes'], icon: '🥛', defaultBg: 'rgba(56, 189, 248, 0.18)' },
  { keywords: ['walk', 'walking', 'run', 'running', 'runner', 'step', 'steps', '10k steps', 'jog', 'jogging', 'hike', 'hiking', 'cardio', 'treadmill', 'marathon', 'sprint'], icon: '👟', defaultBg: 'rgba(249, 115, 22, 0.18)' },
  { keywords: ['cycle', 'cycling', 'bike', 'biking', 'bicycle', 'ride', 'riding', 'spin class'], icon: '🚴', defaultBg: 'rgba(245, 158, 11, 0.18)' },
  { keywords: ['vitamin', 'vitamins', 'supplement', 'supplements', 'medicine', 'medication', 'pill', 'pills', 'creatine', 'omega'], icon: '💊', defaultBg: 'rgba(239, 68, 68, 0.18)' },
  { keywords: ['eat', 'diet', 'meal', 'nutrition', 'healthy', 'salad', 'greens', 'vegetables', 'calories', 'macro', 'fasting', 'intermittent fasting'], icon: '🥗', defaultBg: 'rgba(16, 185, 129, 0.18)' },
  { keywords: ['cook', 'cooking', 'kitchen', 'bake', 'baking', 'recipe', 'food', 'chef', 'meal prep', 'breakfast', 'dinner', 'lunch'], icon: '🍳', defaultBg: 'rgba(249, 115, 22, 0.18)' },
  { keywords: ['read', 'reading', 'book', 'books', 'study', 'studying', 'learn', 'learning', 'course', 'textbook', 'homework', 'exam'], icon: '📚', defaultBg: 'rgba(59, 130, 246, 0.18)' },
  { keywords: ['journal', 'journaling', 'diary', 'write', 'writing', 'gratitude', 'gratitude journal', 'essay', 'blog', 'author'], icon: '✍️', defaultBg: 'rgba(139, 92, 246, 0.18)' },
  { keywords: ['code', 'coding', 'program', 'programming', 'software', 'developer', 'dev', 'build', 'github', 'debug', 'algorithm', 'tech'], icon: '💻', defaultBg: 'rgba(99, 102, 241, 0.18)' },
  { keywords: ['save money', 'saving money', 'budget', 'budgeting', 'finance', 'finances', 'money', 'save', 'saving', 'savings', 'expenses', 'invest', 'investing', 'stocks'], icon: '💰', defaultBg: 'rgba(16, 185, 129, 0.18)' },
  { keywords: ['morning', 'sunlight', 'sunrise', 'wake up', 'wake early', 'morning routine', 'morning sun'], icon: '☀️', defaultBg: 'rgba(245, 158, 11, 0.18)' },
  { keywords: ['movie', 'movies', 'series', 'film', 'cinema', 'watch', 'tablet', 'netflix', 'show', 'shows', 'tv show', 'documentary'], icon: '🎬', defaultBg: 'rgba(168, 85, 247, 0.18)' },
  { keywords: ['music', 'instrument', 'guitar', 'piano', 'singing', 'song', 'listen', 'podcast', 'audiobook'], icon: '🎵', defaultBg: 'rgba(168, 85, 247, 0.18)' },
  { keywords: ['clean', 'cleaning', 'tidy', 'organize', 'organizing', 'chore', 'chores', 'laundry', 'vacuum', 'dishes', 'dust', 'sweep'], icon: '🧹', defaultBg: 'rgba(14, 165, 233, 0.18)' },
  { keywords: ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'walk dog'], icon: '🐾', defaultBg: 'rgba(249, 115, 22, 0.18)' },
  { keywords: ['plant', 'plants', 'garden', 'gardening', 'water plants', 'flowers'], icon: '🌱', defaultBg: 'rgba(16, 185, 129, 0.18)' },
  { keywords: ['art', 'draw', 'drawing', 'paint', 'painting', 'sketch', 'sketching', 'design', 'creative', 'illustration'], icon: '🎨', defaultBg: 'rgba(236, 72, 153, 0.18)' },
  { keywords: ['language', 'languages', 'duolingo', 'vocab', 'vocabulary', 'spanish', 'french', 'german', 'speak', 'fluency'], icon: '🗣️', defaultBg: 'rgba(14, 165, 233, 0.18)' },
  { keywords: ['digital detox', 'screen time', 'detox', 'limit phone', 'no social media', 'no scroll', 'unplug'], icon: '📵', defaultBg: 'rgba(239, 68, 68, 0.18)' },
  { keywords: ['quit smoking', 'no smoking', 'sober', 'sobriety', 'no alcohol', 'stop smoking', 'quit sugar'], icon: '🚭', defaultBg: 'rgba(107, 114, 128, 0.18)' },
  { keywords: ['travel', 'trip', 'explore', 'vacation', 'sunday', 'outing', 'flight', 'airport', 'journey'], icon: '✈️', defaultBg: 'rgba(6, 182, 212, 0.18)' },
];

export const HABIT_ICON_PRESETS = [
  '🎯', '💪', '👟', '🧘', '📚', '🥛', '💧', '🪥', '🚿', '🌙',
  '🛌', '🥗', '🍳', '☀️', '✍️', '💰', '💻', '💼', '🚴', '🤸',
  '💊', '🌱', '🐾', '🎨', '🎵', '🧹', '✈️', '🙏', '📰', '🎬',
  '📵', '🚭',
] as const;

const EMOJI_PREFIX_REGEX = /^(\p{Extended_Pictographic}(?:[\uFE00-\uFE0F]|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)/u;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ICON_BG_MAP = new Map<string, string>(
  HABIT_ICON_PATTERNS.map((p) => [p.icon, p.defaultBg])
);

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

const COMPILED_PATTERNS: CompiledPattern[] = HABIT_ICON_PATTERNS.map((pattern) => {
  const phraseRegexes: RegExp[] = [];
  const wordRegexes: RegExp[] = [];

  for (const kw of pattern.keywords) {
    const trimmed = kw.trim().toLowerCase();
    if (!trimmed) continue;

    if (trimmed.includes(' ')) {
      const phraseParts = trimmed
        .split(/\s+/)
        .map(escapeRegex)
        .join('[\\s-_]+(?:the|a|an|my|our)?[\\s-_]*');
      phraseRegexes.push(new RegExp(`\\b${phraseParts}\\b`, 'i'));
    } else if (STRICT_WORD_REGEXES[trimmed]) {
      wordRegexes.push(STRICT_WORD_REGEXES[trimmed]);
    } else {
      wordRegexes.push(new RegExp(`\\b${escapeRegex(trimmed)}\\w*\\b`, 'i'));
    }
  }

  return { pattern, phraseRegexes, wordRegexes };
});

export function extractLeadingEmoji(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/^(\s*[-*+]\s*(\[[ xX]\])?|\s*\d+[.)])\s*/g, '').trim();
  const match = cleaned.match(EMOJI_PREFIX_REGEX);
  return match ? match[1] : null;
}

function findMatchingPatternInSnippet(snippet: string): HabitIconPattern | null {
  const cleaned = snippet.replace(/^(\s*[-*+]\s*(\[[ xX]\])?|\s*\d+[.)])\s*/g, ' ').trim();
  if (!cleaned) return null;

  for (const compiled of COMPILED_PATTERNS) {
    for (const phraseRegex of compiled.phraseRegexes) {
      if (phraseRegex.test(cleaned)) return compiled.pattern;
    }
  }

  for (const compiled of COMPILED_PATTERNS) {
    for (const wordRegex of compiled.wordRegexes) {
      if (wordRegex.test(cleaned)) return compiled.pattern;
    }
  }

  return null;
}

function findMatchingPattern(text: string): HabitIconPattern | null {
  if (!text || typeof text !== 'string') return null;
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLineMatch = findMatchingPatternInSnippet(lines[0]);
  if (firstLineMatch) return firstLineMatch;

  for (let i = 1; i < lines.length; i++) {
    const match = findMatchingPatternInSnippet(lines[i]);
    if (match) return match;
  }

  return null;
}

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
    const patternBg = ICON_BG_MAP.get(icon.trim());
    if (patternBg) return patternBg;
  }
  return DEFAULT_FALLBACK_BG;
}

export function suggestHabitIcon(
  text?: string | null,
  fallbackIcon: string = DEFAULT_FALLBACK_ICON
): string {
  if (!text || typeof text !== 'string') return fallbackIcon;
  const leading = extractLeadingEmoji(text);
  if (leading && leading !== DEFAULT_FALLBACK_ICON) return leading;
  const matched = findMatchingPattern(text);
  return matched ? matched.icon : fallbackIcon;
}

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
  if (rawIcon && rawIcon !== DEFAULT_FALLBACK_ICON) {
    return {
      bg: getHabitIconBackground(rawIcon, habit.color, fallbackSurfaceHighlight),
      icon: rawIcon,
    };
  }

  const habitName = typeof habit.name === 'string' ? habit.name : '';
  const leadingEmoji = extractLeadingEmoji(habitName);
  if (leadingEmoji && leadingEmoji !== DEFAULT_FALLBACK_ICON) {
    return {
      bg: getHabitIconBackground(leadingEmoji, habit.color, fallbackSurfaceHighlight),
      icon: leadingEmoji,
    };
  }

  if (habitName.trim()) {
    const matched = findMatchingPattern(habitName);
    if (matched) {
      return {
        bg: getHabitIconBackground(matched.icon, habit.color, fallbackSurfaceHighlight),
        icon: matched.icon,
      };
    }
  }

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

  const resolvedIcon = rawIcon || DEFAULT_FALLBACK_ICON;
  return {
    bg: getHabitIconBackground(resolvedIcon, habit.color, fallbackSurfaceHighlight),
    icon: resolvedIcon,
  };
}
