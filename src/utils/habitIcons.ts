import { HabitWithStreak } from '../types';

interface HabitIconPattern {
  keywords: string[];
  icon: string;
  defaultBg: string;
}

const HABIT_ICON_PATTERNS: HabitIconPattern[] = [
  {
    keywords: ['sleep', 'rest', 'nap', 'bedtime', 'night'],
    icon: '🌙',
    defaultBg: 'rgba(139, 92, 246, 0.18)',
  },
  {
    keywords: ['devot', 'pray', 'god', 'spiritual', 'upvas', 'puja', 'temple', 'faith', 'motivation'],
    icon: '🙏',
    defaultBg: 'rgba(245, 158, 11, 0.18)',
  },
  {
    keywords: ['job', 'apply', 'career', 'resume', 'interview', 'work', 'hire'],
    icon: '💼',
    defaultBg: 'rgba(59, 130, 246, 0.18)',
  },
  {
    keywords: ['news', 'article', 'feed', 'paper', 'journalism', 'editing'],
    icon: '📰',
    defaultBg: 'rgba(14, 165, 233, 0.18)',
  },
  {
    keywords: ['gym', 'workout', 'fit', 'exercise', 'lift', 'strength', 'training'],
    icon: '💪',
    defaultBg: 'rgba(239, 68, 68, 0.18)',
  },
  {
    keywords: ['meditat', 'relax', 'breathe', 'mindful', 'calm', 'zen', 'peace'],
    icon: '🧘',
    defaultBg: 'rgba(16, 185, 129, 0.18)',
  },
  {
    keywords: ['stretch', 'yoga', 'flex', 'pilates'],
    icon: '🤸',
    defaultBg: 'rgba(236, 72, 153, 0.18)',
  },
  {
    keywords: ['movie', 'series', 'film', 'cinema', 'watch', 'tablet', 'netflix', 'show'],
    icon: '🎬',
    defaultBg: 'rgba(168, 85, 247, 0.18)',
  },
  {
    keywords: ['read', 'book', 'study', 'learn', 'course', 'journal', 'write'],
    icon: '📚',
    defaultBg: 'rgba(59, 130, 246, 0.18)',
  },
  {
    keywords: ['cook', 'kitchen', 'bake', 'recipe', 'food', 'chef'],
    icon: '🍳',
    defaultBg: 'rgba(249, 115, 22, 0.18)',
  },
  {
    keywords: ['travel', 'trip', 'explore', 'vacation', 'sunday', 'outing'],
    icon: '✈️',
    defaultBg: 'rgba(6, 182, 212, 0.18)',
  },
  {
    keywords: ['walk', 'run', 'step', 'jog', 'hike', 'cardio'],
    icon: '👟',
    defaultBg: 'rgba(249, 115, 22, 0.18)',
  },
  {
    keywords: ['water', 'hydrat', 'drink', 'fluid', 'hygienic'],
    icon: '🥛',
    defaultBg: 'rgba(56, 189, 248, 0.18)',
  },
  {
    keywords: ['code', 'program', 'dev', 'software', 'build'],
    icon: '💻',
    defaultBg: 'rgba(99, 102, 241, 0.18)',
  },
  {
    keywords: ['cycle', 'bike', 'ride'],
    icon: '🚴',
    defaultBg: 'rgba(245, 158, 11, 0.18)',
  },
  {
    keywords: ['eat', 'diet', 'meal', 'nutrition', 'healthy', 'salad'],
    icon: '🥗',
    defaultBg: 'rgba(16, 185, 129, 0.18)',
  },
  {
    keywords: ['clean', 'tidy', 'organize', 'chore', 'laundry'],
    icon: '🧹',
    defaultBg: 'rgba(14, 165, 233, 0.18)',
  },
];

const DEFAULT_FALLBACK_ICON = '🎯';
const DEFAULT_FALLBACK_BG = 'rgba(255, 107, 0, 0.14)';

/**
 * Resolves the visual icon and background color tint for a habit.
 * Prioritizes user-configured custom icons, but falls back to smart keyword heuristics
 * if the icon is undefined or the default fallback target ('🎯').
 */
export function getHabitIconDetails(
  habit: HabitWithStreak,
  fallbackSurfaceHighlight?: string
): { bg: string; icon: string } {
  const customBg = habit.color ? `${habit.color}22` : null;

  // If user selected an icon other than the generic default target 🎯, honor it
  if (habit.icon && habit.icon !== DEFAULT_FALLBACK_ICON) {
    return {
      bg: customBg || fallbackSurfaceHighlight || 'rgba(139, 92, 246, 0.15)',
      icon: habit.icon,
    };
  }

  // Keyword heuristic matching against habit name
  const normalizedName = habit.name.toLowerCase().trim();

  for (const pattern of HABIT_ICON_PATTERNS) {
    if (pattern.keywords.some((kw) => normalizedName.includes(kw))) {
      return {
        bg: customBg || pattern.defaultBg,
        icon: pattern.icon,
      };
    }
  }

  return {
    bg: customBg || fallbackSurfaceHighlight || DEFAULT_FALLBACK_BG,
    icon: habit.icon || DEFAULT_FALLBACK_ICON,
  };
}
