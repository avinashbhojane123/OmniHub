import { Injectable } from '@nestjs/common';

export interface ServerRiskResult {
  riskDetected: boolean;
  category?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  matchedKeywords: string[];
  maskedSnippet: string;
}

@Injectable()
export class RiskEngineService {
  private readonly riskRules = [
    {
      category: 'SELF_HARM',
      severity: 'CRITICAL' as const,
      keywords: [
        'kill myself',
        'cut myself',
        'want to die',
        'suicide',
        'hurt myself',
        'end my life',
        'slit my wrist',
      ],
    },
    {
      category: 'GROOMING',
      severity: 'CRITICAL' as const,
      keywords: [
        "don't tell your mom",
        "don't tell your parents",
        'secret picture',
        'keep this between us',
        'are you home alone',
        'meet me alone',
        'send nudes',
      ],
    },
    {
      category: 'SEXTORTION',
      severity: 'CRITICAL' as const,
      keywords: [
        'leak your photos',
        'expose you online',
        'send money or i post',
        'blackmail',
        'i have your webcam',
      ],
    },
    {
      category: 'CYBERBULLYING',
      severity: 'HIGH' as const,
      keywords: [
        'nobody likes you',
        'ugly loser',
        'go away freak',
        'everyone hates you',
        'kill yourself',
        'you are worthless',
      ],
    },
    {
      category: 'DRUGS',
      severity: 'HIGH' as const,
      keywords: ['buy weed', 'pills dealer', 'vape juice', 'cocaine', 'fentanyl'],
    },
    {
      category: 'ABUSIVE_LANGUAGE',
      severity: 'MEDIUM' as const,
      keywords: ['hate you so much', 'piece of trash', 'get lost loser', 'shut up idiot'],
    },
  ];

  public analyze(rawText: string): ServerRiskResult {
    if (!rawText || rawText.trim().length === 0) {
      return {
        riskDetected: false,
        matchedKeywords: [],
        maskedSnippet: '',
      };
    }

    const normalized = rawText.toLowerCase();
    const matchedKeywords: string[] = [];
    let detectedCategory: string | undefined;
    let detectedSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined;

    for (const rule of this.riskRules) {
      const hits = rule.keywords.filter((kw) => normalized.includes(kw));
      if (hits.length > 0) {
        matchedKeywords.push(...hits);
        if (!detectedSeverity || this.getSeverityWeight(rule.severity) > this.getSeverityWeight(detectedSeverity)) {
          detectedCategory = rule.category;
          detectedSeverity = rule.severity;
        }
      }
    }

    if (matchedKeywords.length === 0 || !detectedCategory || !detectedSeverity) {
      return {
        riskDetected: false,
        matchedKeywords: [],
        maskedSnippet: rawText.slice(0, 100),
      };
    }

    let masked = rawText;
    for (const kw of matchedKeywords) {
      const reg = new RegExp(`(${kw})`, 'gi');
      masked = masked.replace(reg, '⚠️ [FLAGGED: $1] ⚠️');
    }

    return {
      riskDetected: true,
      category: detectedCategory,
      severity: detectedSeverity,
      matchedKeywords: Array.from(new Set(matchedKeywords)),
      maskedSnippet: masked,
    };
  }

  private getSeverityWeight(sev: string): number {
    switch (sev) {
      case 'CRITICAL':
        return 4;
      case 'HIGH':
        return 3;
      case 'MEDIUM':
        return 2;
      default:
        return 1;
    }
  }
}
