import { RiskCategory, RiskSeverity } from '../../types/safeguard';

interface RiskRule {
  category: RiskCategory;
  severity: RiskSeverity;
  keywords: string[];
}

const RISK_DICTIONARY: RiskRule[] = [
  {
    category: 'SELF_HARM',
    severity: 'CRITICAL',
    keywords: [
      'kill myself',
      'cut myself',
      'want to die',
      'suicide',
      'hurt myself',
      'end my life',
      'no reason to live',
      'better off dead',
      'slit my wrist',
    ],
  },
  {
    category: 'GROOMING',
    severity: 'CRITICAL',
    keywords: [
      "don't tell your mom",
      "don't tell your parents",
      'secret picture',
      'keep this between us',
      'are you home alone',
      'sneak out tonight',
      'meet me alone',
      'where do you live alone',
      'send nudes',
      'send private pic',
    ],
  },
  {
    category: 'SEXTORTION',
    severity: 'CRITICAL',
    keywords: [
      'leak your photos',
      'expose you online',
      'send money or i post',
      'blackmail',
      'post your pictures',
      'i have your webcam',
    ],
  },
  {
    category: 'CYBERBULLYING',
    severity: 'HIGH',
    keywords: [
      'nobody likes you',
      'ugly loser',
      'go away freak',
      'everyone hates you',
      'kill yourself',
      'you are worthless',
      'fat pig',
      'shut up idiot',
    ],
  },
  {
    category: 'DRUGS',
    severity: 'HIGH',
    keywords: [
      'buy weed',
      'pills dealer',
      'vape juice',
      'get high tonight',
      'cocaine',
      'fentanyl',
      'ecstasy pop',
      'selling edibles',
    ],
  },
  {
    category: 'ABUSIVE_LANGUAGE',
    severity: 'MEDIUM',
    keywords: [
      'hate you so much',
      'piece of trash',
      'get lost loser',
      'screwed up',
      'stupid dummy',
    ],
  },
];

export interface RiskAnalysisResult {
  riskDetected: boolean;
  category?: RiskCategory;
  severity?: RiskSeverity;
  matchedKeywords: string[];
  maskedSnippet: string;
}

export class RiskDetectionEngine {
  /**
   * Scans text content against categorized risk patterns
   */
  public static analyzeText(rawText: string, _appName: string = 'Unknown'): RiskAnalysisResult {
    if (!rawText || rawText.trim().length === 0) {
      return {
        riskDetected: false,
        matchedKeywords: [],
        maskedSnippet: '',
      };
    }

    const normalized = rawText.toLowerCase();
    let highestSeverity: RiskSeverity | undefined;
    let matchedCategory: RiskCategory | undefined;
    const allMatches: string[] = [];

    const severityWeight: Record<RiskSeverity, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    let maxWeight = 0;

    for (const rule of RISK_DICTIONARY) {
      const foundInRule = rule.keywords.filter((kw) => normalized.includes(kw));
      if (foundInRule.length > 0) {
        allMatches.push(...foundInRule);
        const weight = severityWeight[rule.severity];
        if (weight > maxWeight) {
          maxWeight = weight;
          highestSeverity = rule.severity;
          matchedCategory = rule.category;
        }
      }
    }

    if (allMatches.length === 0 || !highestSeverity || !matchedCategory) {
      return {
        riskDetected: false,
        matchedKeywords: [],
        maskedSnippet: rawText.slice(0, 80),
      };
    }

    // Responsible redaction for child privacy
    let masked = rawText;
    for (const kw of allMatches) {
      const regex = new RegExp(`(${kw})`, 'gi');
      masked = masked.replace(regex, '⚠️ [FLAGGED: $1] ⚠️');
    }

    return {
      riskDetected: true,
      category: matchedCategory,
      severity: highestSeverity,
      matchedKeywords: Array.from(new Set(allMatches)),
      maskedSnippet: masked,
    };
  }

  /**
   * Guidance recommendations for parents based on category
   */
  public static getParentGuidance(category: RiskCategory): {
    title: string;
    advice: string;
    helpline?: string;
  } {
    switch (category) {
      case 'SELF_HARM':
        return {
          title: 'Immediate Compassionate Intervention',
          advice:
            'Approach your child calmly with love and support, not anger. Listen without judgment. Reach out to a certified counselor or crisis helpline immediately.',
          helpline: 'National Suicide Prevention Lifeline: 988 (USA) / Childline: 1098 (India)',
        };
      case 'GROOMING':
      case 'SEXTORTION':
        return {
          title: 'Child Safety & Cyber Protection',
          advice:
            'Do not delete any messages as they serve as legal evidence. Assure your child they are not at fault. Block the predator and consider reporting to cyber safety authorities.',
          helpline: 'Cyber Tipline / NCMEC: 1-800-843-5678',
        };
      case 'CYBERBULLYING':
      case 'ABUSIVE_LANGUAGE':
        return {
          title: 'Emotional Support & School Mediation',
          advice:
            'Validate your child’s emotions. Take screenshots if harassment originates from classmates, and contact school administration or community moderators.',
        };
      case 'DRUGS':
        return {
          title: 'Open Dialogue & Boundaries',
          advice:
            'Have an honest, non-punitive conversation about peer pressure and digital influences. Review who they interact with online.',
        };
    }
  }
}
