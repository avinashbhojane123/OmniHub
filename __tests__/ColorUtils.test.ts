import {
  withOpacity,
  parseColor,
  isValidColor,
  rgbToHsl,
  getContrastTextColor,
  getRelativeLuminance,
  getContrastRatio,
  isDark,
  isLight,
  hexToRgba,
  rgbaToHex,
  blendColors,
  darken,
  lighten,
} from '../src/utils/color';

describe('Color Utilities (src/utils/color.ts)', () => {
  describe('isValidColor', () => {
    it('accurately identifies valid and invalid color strings', () => {
      expect(isValidColor('#FF6B00')).toBe(true);
      expect(isValidColor('#F60')).toBe(true);
      expect(isValidColor('#FF6B0080')).toBe(true);
      expect(isValidColor('rgb(255, 107, 0)')).toBe(true);
      expect(isValidColor('hsl(120, 100%, 50%)')).toBe(true);
      expect(isValidColor('white')).toBe(true);

      expect(isValidColor(null)).toBe(false);
      expect(isValidColor(undefined)).toBe(false);
      expect(isValidColor('')).toBe(false);
      expect(isValidColor('not-a-color')).toBe(false);
      expect(isValidColor(123)).toBe(false);
    });
  });
  describe('parseColor', () => {
    it('returns null for null, undefined, empty, or non-string inputs', () => {
      expect(parseColor(null)).toBeNull();
      expect(parseColor(undefined)).toBeNull();
      expect(parseColor('')).toBeNull();
      expect(parseColor('   ')).toBeNull();
      expect(parseColor(12345 as any)).toBeNull();
      expect(parseColor('not-a-color')).toBeNull();
    });

    it('parses standard 6-digit hex (#RRGGBB and RRGGBB)', () => {
      expect(parseColor('#FF6B00')).toEqual({ r: 255, g: 107, b: 0, a: 1 });
      expect(parseColor('3B82F6')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
      expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('parses shorthand 3-digit hex (#RGB and RGB)', () => {
      expect(parseColor('#F60')).toEqual({ r: 255, g: 102, b: 0, a: 1 });
      expect(parseColor('FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('parses 8-digit hex with alpha (#RRGGBBAA and RRGGBBAA)', () => {
      const res = parseColor('#FF6B0080');
      expect(res).not.toBeNull();
      expect(res!.r).toBe(255);
      expect(res!.g).toBe(107);
      expect(res!.b).toBe(0);
      expect(res!.a).toBeCloseTo(0.5, 1);

      expect(parseColor('#FFFFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor('#00000000')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('parses 4-digit hex with alpha (#RGBA and RGBA)', () => {
      const res = parseColor('#F008');
      expect(res).not.toBeNull();
      expect(res!.r).toBe(255);
      expect(res!.g).toBe(0);
      expect(res!.b).toBe(0);
      expect(res!.a).toBeCloseTo(0.533, 2);

      expect(parseColor('#FFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('parses standard comma-separated rgb(...) and rgba(...)', () => {
      expect(parseColor('rgb(255, 107, 0)')).toEqual({ r: 255, g: 107, b: 0, a: 1 });
      expect(parseColor('rgba(255, 107, 0, 0.4)')).toEqual({ r: 255, g: 107, b: 0, a: 0.4 });
      expect(parseColor('rgba(59, 130, 246, 1)')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    });

    it('parses modern space/slash syntax and percentages', () => {
      expect(parseColor('rgb(255 107 0 / 0.5)')).toEqual({ r: 255, g: 107, b: 0, a: 0.5 });
      expect(parseColor('rgba(100% 0% 0% / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it('parses hsl(...) and hsla(...) with various angle units', () => {
      expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor('hsl(120deg, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(parseColor('hsl(0.5turn, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 255, a: 1 }); // 180 deg = cyan
      expect(parseColor('hsl(240, 100%, 50%)')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(parseColor('hsla(0, 100%, 50%, 0.25)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 });
    });

    it('parses named CSS colors', () => {
      expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
      expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor('cyan')).toEqual({ r: 0, g: 255, b: 255, a: 1 });
    });
  });

  describe('withOpacity', () => {
    it('safely clamps opacity within [0, 1] and handles NaN/non-finite numbers', () => {
      expect(withOpacity(null, 1.5)).toBe('rgba(255, 107, 0, 1)');
      expect(withOpacity(null, -0.5)).toBe('rgba(255, 107, 0, 0)');
      expect(withOpacity(null, NaN)).toBe('rgba(255, 107, 0, 1)');
      expect(withOpacity(null, 0.35)).toBe('rgba(255, 107, 0, 0.35)');
    });

    it('applies opacity to 6-digit hex', () => {
      expect(withOpacity('#FF6B00', 0.18)).toBe('rgba(255, 107, 0, 0.18)');
      expect(withOpacity('3B82F6', 0.5)).toBe('rgba(59, 130, 246, 0.5)');
    });

    it('applies opacity to 3-digit shorthand hex', () => {
      expect(withOpacity('#F60', 0.2)).toBe('rgba(255, 102, 0, 0.2)');
      expect(withOpacity('#FFF', 0.08)).toBe('rgba(255, 255, 255, 0.08)');
    });

    it('applies opacity to 8-digit and 4-digit hex overriding old alpha', () => {
      expect(withOpacity('#FF6B00FF', 0.15)).toBe('rgba(255, 107, 0, 0.15)');
      expect(withOpacity('#F008', 0.25)).toBe('rgba(255, 0, 0, 0.25)');
    });

    it('applies opacity to rgb(...) and rgba(...)', () => {
      expect(withOpacity('rgb(59, 130, 246)', 0.18)).toBe('rgba(59, 130, 246, 0.18)');
      expect(withOpacity('rgba(59, 130, 246, 0.9)', 0.2)).toBe('rgba(59, 130, 246, 0.2)');
      expect(withOpacity('rgb(255 107 0 / 100%)', 0.14)).toBe('rgba(255, 107, 0, 0.14)');
    });

    it('applies opacity to HSL/HSLA', () => {
      expect(withOpacity('hsl(0, 100%, 50%)', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
      expect(withOpacity('hsla(120, 100%, 50%, 0.8)', 0.3)).toBe('rgba(0, 255, 0, 0.3)');
    });

    it('applies opacity to named colors', () => {
      expect(withOpacity('white', 0.1)).toBe('rgba(255, 255, 255, 0.1)');
      expect(withOpacity('black', 0.65)).toBe('rgba(0, 0, 0, 0.65)');
      expect(withOpacity('transparent', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    });

    it('uses fallbackColor when provided and primary color is empty or unparseable', () => {
      expect(withOpacity('', 0.2, '#3B82F6')).toBe('rgba(59, 130, 246, 0.2)');
      expect(withOpacity(null, 0.5, '#10B981')).toBe('rgba(16, 185, 129, 0.5)');
      expect(withOpacity('unparseable', 0.3, '#FF6B00')).toBe('rgba(255, 107, 0, 0.3)');
    });

    it('returns trimmed string for completely unrecognized color without fallback', () => {
      expect(withOpacity('invalid-color', 0.5)).toBe('invalid-color');
    });
  });

  describe('WCAG Relative Luminance & Contrast', () => {
    it('computes accurate relative luminance [0, 1]', () => {
      expect(getRelativeLuminance('#000000')).toBeCloseTo(0, 4);
      expect(getRelativeLuminance('#FFFFFF')).toBeCloseTo(1, 4);
      expect(getRelativeLuminance(null)).toBe(0);
    });

    it('calculates contrast ratio according to WCAG 2.1', () => {
      expect(getContrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
      expect(getContrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 0);
    });

    it('selects accessible dark text for OmniHub primary orange (#FF6B00)', () => {
      // White on #FF6B00 has only ~2.86:1 contrast (fails WCAG AA)
      // Dark #1E293B on #FF6B00 has ~5.12:1 contrast (passes WCAG AA)
      const text = getContrastTextColor('#FF6B00');
      expect(text).toBe('#1E293B');
    });

    it('selects dark text for bright and light backgrounds', () => {
      expect(getContrastTextColor('#FFFFFF')).toBe('#1E293B');
      expect(getContrastTextColor('#FFFFFFFF')).toBe('#1E293B');
      expect(getContrastTextColor('#FFFF')).toBe('#1E293B');
      expect(getContrastTextColor('#F59E0B')).toBe('#1E293B'); // Amber
      expect(getContrastTextColor('#10B981')).toBe('#1E293B'); // Emerald
      expect(getContrastTextColor('#EAB308')).toBe('#1E293B'); // Yellow
      expect(getContrastTextColor('#06B6D4')).toBe('#1E293B'); // Cyan
    });

    it('selects light text for deep, dark backgrounds', () => {
      expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
      expect(getContrastTextColor('#0F172A')).toBe('#FFFFFF'); // Dark Slate
      expect(getContrastTextColor('#1E3A8A')).toBe('#FFFFFF'); // Deep Blue
      expect(getContrastTextColor('#581C87')).toBe('#FFFFFF'); // Deep Purple
    });

    it('handles low-opacity or transparent backgrounds and respects surfaceColor compositing', () => {
      expect(getContrastTextColor('rgba(0, 0, 0, 0.1)')).toBe('#1E293B');
      expect(getContrastTextColor('transparent')).toBe('#1E293B');
      expect(getContrastTextColor(null)).toBe('#FFFFFF');

      // Faint white tint (rgba(255, 255, 255, 0.15)) over dark background (#0F172A) yields dark surface -> light text
      expect(getContrastTextColor('rgba(255, 255, 255, 0.15)', '#1E293B', '#FFFFFF', '#0F172A')).toBe('#FFFFFF');

      // Faint dark tint (rgba(0, 0, 0, 0.15)) over white background (#FFFFFF) yields light surface -> dark text
      expect(getContrastTextColor('rgba(0, 0, 0, 0.15)', '#1E293B', '#FFFFFF', '#FFFFFF')).toBe('#1E293B');
    });

    it('allows customized dark and light text options', () => {
      expect(getContrastTextColor('#FFFFFF', '#000000', '#FAFAFA')).toBe('#000000');
      expect(getContrastTextColor('#000000', '#000000', '#FAFAFA')).toBe('#FAFAFA');
    });
  });

  describe('isDark & isLight', () => {
    it('correctly classifies dark and light colors', () => {
      expect(isDark('#000000')).toBe(true);
      expect(isDark('#0F172A')).toBe(true);
      expect(isDark('#FFFFFF')).toBe(false);

      expect(isLight('#FFFFFF')).toBe(true);
      expect(isLight('#F3F4F6')).toBe(true);
      expect(isLight('#000000')).toBe(false);
    });
  });

  describe('Color Conversion & Manipulation Helpers', () => {
    describe('hexToRgba', () => {
      it('converts hex to rgba string', () => {
        expect(hexToRgba('#FF6B00', 0.2)).toBe('rgba(255, 107, 0, 0.2)');
        expect(hexToRgba('#FFF', 1)).toBe('rgba(255, 255, 255, 1)');
      });
    });

    describe('rgbaToHex', () => {
      it('converts colors to 6-digit or 8-digit hex', () => {
        expect(rgbaToHex('rgba(255, 107, 0, 1)', false)).toBe('#FF6B00');
        expect(rgbaToHex('rgba(255, 107, 0, 1)', true)).toBe('#FF6B00FF');
        expect(rgbaToHex('rgba(255, 107, 0, 1)', 'auto')).toBe('#FF6B00');
        expect(rgbaToHex('rgba(255, 107, 0, 0.5)', 'auto')).toBe('#FF6B0080');
        expect(rgbaToHex('white', false)).toBe('#FFFFFF');
        expect(rgbaToHex(null)).toBe('#000000');
      });
    });

    describe('rgbToHsl', () => {
      it('accurately converts RGB channels to HSL components', () => {
        expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 1, l: 0.5 });
        expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 1, l: 0.5 });
        expect(rgbToHsl(0, 0, 255)).toEqual({ h: 240, s: 1, l: 0.5 });
        expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 1 });
        expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
      });
    });

    describe('blendColors', () => {
      it('blends semi-transparent foreground over background', () => {
        // 50% black over 100% white yields 50% gray
        const blended = blendColors('rgba(0, 0, 0, 0.5)', 'rgba(255, 255, 255, 1)');
        expect(blended).toBe('rgba(128, 128, 128, 1)');
      });

      it('safely handles missing or transparent inputs', () => {
        expect(blendColors('transparent', 'transparent')).toBe('rgba(0, 0, 0, 0)');
        expect(blendColors('#FF6B00', null as any)).toBe('rgba(255, 107, 0, 1)');
      });
    });

    describe('darken & lighten', () => {
      it('darkens color towards black', () => {
        const darkened = darken('rgb(200, 200, 200)', 0.5);
        expect(darkened).toBe('rgba(100, 100, 100, 1)');
      });

      it('lightens color towards white', () => {
        const lightened = lighten('rgb(100, 100, 100)', 0.5);
        expect(lightened).toBe('rgba(178, 178, 178, 1)');
      });
    });
  });
});

