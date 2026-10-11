import { RiskDetectionEngine } from '../src/services/safeguard/RiskDetectionEngine';

describe('SafeGuard RiskDetectionEngine Unit Test Suite', () => {
  it('1. should detect critical self-harm keywords and flag with CRITICAL severity', () => {
    const text = 'I feel so broken and want to hurt myself today';
    const result = RiskDetectionEngine.analyzeText(text, 'Test Chat');

    expect(result.riskDetected).toBe(true);
    expect(result.category).toBe('SELF_HARM');
    expect(result.severity).toBe('CRITICAL');
    expect(result.matchedKeywords).toContain('hurt myself');
    expect(result.maskedSnippet).toContain('⚠️ [FLAGGED: hurt myself] ⚠️');
  });

  it('2. should detect predatory grooming patterns and generate parent alert', () => {
    const text = "Hey Emma, don't tell your mom about where we are meeting tonight.";
    const result = RiskDetectionEngine.analyzeText(text, 'Instagram Direct');

    expect(result.riskDetected).toBe(true);
    expect(result.category).toBe('GROOMING');
    expect(result.severity).toBe('CRITICAL');
    expect(result.matchedKeywords).toContain("don't tell your mom");
  });

  it('3. should detect cyberbullying and verbal harassment', () => {
    const text = 'Get out of here nobody likes you, you ugly loser';
    const result = RiskDetectionEngine.analyzeText(text, 'Discord');

    expect(result.riskDetected).toBe(true);
    expect(result.category).toBe('CYBERBULLYING');
    expect(result.severity).toBe('HIGH');
    expect(result.matchedKeywords).toContain('nobody likes you');
    expect(result.matchedKeywords).toContain('ugly loser');
  });

  it('4. should NOT flag benign homework or friendly chat messages', () => {
    const text = 'Hey can you send me the science homework questions from chapter 4?';
    const result = RiskDetectionEngine.analyzeText(text, 'WhatsApp');

    expect(result.riskDetected).toBe(false);
    expect(result.matchedKeywords.length).toBe(0);
  });

  it('5. should provide empathetic parent guidance for detected category', () => {
    const guidance = RiskDetectionEngine.getParentGuidance('SELF_HARM');
    expect(guidance.title).toBeDefined();
    expect(guidance.helpline).toContain('988');
  });
});
