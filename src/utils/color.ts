export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
  a: number;
}

/**
 * Standard CSS/SVG/HTML color keywords mapped to RGBA tuples [r, g, b, a].
 */
const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
  orange: [255, 165, 0, 1],
  purple: [128, 0, 128, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  lightgray: [211, 211, 211, 1],
  lightgrey: [211, 211, 211, 1],
  darkgray: [169, 169, 169, 1],
  darkgrey: [169, 169, 169, 1],
  cyan: [0, 255, 255, 1],
  magenta: [255, 0, 255, 1],
  silver: [192, 192, 192, 1],
  navy: [0, 0, 128, 1],
  teal: [0, 128, 128, 1],
  lime: [0, 255, 0, 1],
  maroon: [128, 0, 0, 1],
  olive: [128, 128, 0, 1],
  aqua: [0, 255, 255, 1],
  fuchsia: [255, 0, 255, 1],
  indigo: [75, 0, 130, 1],
  violet: [238, 130, 238, 1],
  pink: [255, 192, 203, 1],
  coral: [255, 127, 80, 1],
  salmon: [250, 128, 114, 1],
  gold: [255, 215, 0, 1],
  khaki: [240, 230, 140, 1],
  brown: [165, 42, 42, 1],
  chocolate: [210, 105, 30, 1],
  tan: [210, 180, 140, 1],
  ivory: [255, 255, 240, 1],
  beige: [245, 245, 220, 1],
  snow: [255, 250, 250, 1],
  whitesmoke: [245, 245, 245, 1],
  azure: [240, 255, 255, 1],
  aliceblue: [240, 248, 255, 1],
  lavender: [230, 230, 250, 1],
  crimson: [220, 20, 60, 1],
  tomato: [255, 99, 71, 1],
  orangered: [255, 69, 0, 1],
  darkorange: [255, 140, 0, 1],
  hotpink: [255, 105, 180, 1],
  deeppink: [255, 20, 147, 1],
  skyblue: [135, 206, 235, 1],
  deepskyblue: [0, 191, 255, 1],
  dodgerblue: [30, 144, 255, 1],
  royalblue: [65, 105, 225, 1],
  midnightblue: [25, 25, 112, 1],
  forestgreen: [34, 139, 34, 1],
  seagreen: [46, 139, 87, 1],
  springgreen: [0, 255, 127, 1],
  darkgreen: [0, 100, 0, 1],
  yellowgreen: [154, 205, 50, 1],
  chartreuse: [127, 255, 0, 1],
  darkred: [139, 0, 0, 1],
  darkblue: [0, 0, 139, 1],
  darkcyan: [0, 139, 139, 1],
  darkmagenta: [139, 0, 139, 1],
  darkviolet: [148, 0, 211, 1],
  slategray: [112, 128, 144, 1],
  slategrey: [112, 128, 144, 1],
  darkslategray: [47, 79, 79, 1],
  darkslategrey: [47, 79, 79, 1],
};

/**
 * Normalizes CSS hue angle units (deg, rad, turn, grad) to degrees [0, 360].
 */
function parseAngle(val: number, unit?: string): number {
  if (!unit || unit === 'deg') return val;
  if (unit === 'rad') return (val * 180) / Math.PI;
  if (unit === 'turn') return val * 360;
  if (unit === 'grad') return val * 0.9;
  return val;
}

/**
 * Converts HSL values to RGB [0-255].
 * @param h Hue in degrees [0, 360]
 * @param s Saturation [0, 1]
 * @param l Lightness [0, 1]
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(1, s));
  const normL = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (normH >= 0 && normH < 60) {
    r = c; g = x; b = 0;
  } else if (normH >= 60 && normH < 120) {
    r = x; g = c; b = 0;
  } else if (normH >= 120 && normH < 180) {
    r = 0; g = c; b = x;
  } else if (normH >= 180 && normH < 240) {
    r = 0; g = x; b = c;
  } else if (normH >= 240 && normH < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Converts RGB [0-255] values to HSL [h: 0-360, s: 0-1, l: 0-1].
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const normR = Math.max(0, Math.min(255, r)) / 255;
  const normG = Math.max(0, Math.min(255, g)) / 255;
  const normB = Math.max(0, Math.min(255, b)) / 255;

  const max = Math.max(normR, normG, normB);
  const min = Math.min(normR, normG, normB);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case normR:
        h = (normG - normB) / delta + (normG < normB ? 6 : 0);
        break;
      case normG:
        h = (normB - normR) / delta + 2;
        break;
      case normB:
        h = (normR - normG) / delta + 4;
        break;
    }
    h = Math.round(h * 60);
  }

  return {
    h,
    s: Number(s.toFixed(4)),
    l: Number(l.toFixed(4)),
  };
}

/**
 * Validates whether an unknown value is a parseable, valid color representation.
 */
export function isValidColor(color: unknown): boolean {
  if (!color || typeof color !== 'string') return false;
  return parseColor(color) !== null;
}

/**
 * Parses any valid color representation (3/4/6/8-digit Hex, RGB, RGBA, HSL, HSLA, Named)
 * into a normalized RGBA object. Returns null for invalid or unparseable color strings.
 */
export function parseColor(color: string | undefined | null): RGBA | null {
  if (!color || typeof color !== 'string') return null;
  const trimmed = color.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Named CSS colors
  if (NAMED_COLORS[trimmed]) {
    const [r, g, b, a] = NAMED_COLORS[trimmed];
    return { r, g, b, a };
  }

  // 2. Hex notation (#RGB, #RGBA, #RRGGBB, #RRGGBBAA, with optional leading #)
  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: Number((parseInt(hex[3] + hex[3], 16) / 255).toFixed(4)),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: Number((parseInt(hex.slice(6, 8), 16) / 255).toFixed(4)),
      };
    }
  }

  // 3. RGB & RGBA (both comma-separated and modern space/slash syntax, plus percentages)
  const rgbMatch = /^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(trimmed);
  if (rgbMatch) {
    let r = parseFloat(rgbMatch[1]);
    let g = parseFloat(rgbMatch[3]);
    let b = parseFloat(rgbMatch[5]);

    if (rgbMatch[2] === '%') r = (r * 255) / 100;
    if (rgbMatch[4] === '%') g = (g * 255) / 100;
    if (rgbMatch[6] === '%') b = (b * 255) / 100;

    let a = 1;
    if (rgbMatch[7] !== undefined) {
      a = parseFloat(rgbMatch[7]);
      if (rgbMatch[8] === '%') a = a / 100;
    }

    return {
      r: Math.round(Math.max(0, Math.min(255, r))),
      g: Math.round(Math.max(0, Math.min(255, g))),
      b: Math.round(Math.max(0, Math.min(255, b))),
      a: Number(Math.max(0, Math.min(1, a)).toFixed(4)),
    };
  }

  // 4. HSL & HSLA (hsl(h, s%, l%) or hsla(h, s%, l%, a), supporting deg/rad/turn/grad)
  const hslMatch = /^hsla?\(\s*([\d.]+)(deg|rad|turn|grad)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(trimmed);
  if (hslMatch) {
    const rawH = parseFloat(hslMatch[1]);
    const unit = hslMatch[2];
    const h = parseAngle(rawH, unit);
    const s = parseFloat(hslMatch[3]) / 100;
    const l = parseFloat(hslMatch[4]) / 100;

    let a = 1;
    if (hslMatch[5] !== undefined) {
      a = parseFloat(hslMatch[5]);
      if (hslMatch[6] === '%') a = a / 100;
    }

    const [r, g, b] = hslToRgb(h, s, l);
    return {
      r,
      g,
      b,
      a: Number(Math.max(0, Math.min(1, a)).toFixed(4)),
    };
  }

  return null;
}

/**
 * Safely applies opacity/alpha to any color string (Hex 3/4/6/8, RGB, RGBA, HSL, HSLA, Named).
 * Always returns a 100% valid React Native / CSS RGBA color string (e.g. "rgba(255, 107, 0, 0.2)").
 * Prevents invalid color strings like "#fff18", "rgba(...)18", empty strings, or un-parsed HSL in React Native.
 */
export function withOpacity(
  color: string | undefined | null,
  opacity: number = 1,
  fallbackColor?: string
): string {
  const clampedOpacity = Number.isFinite(opacity)
    ? Math.max(0, Math.min(1, opacity))
    : 1;

  const formattedAlpha = Number(clampedOpacity.toFixed(4));

  if (!color || typeof color !== 'string' || !color.trim()) {
    if (fallbackColor) {
      const fb = parseColor(fallbackColor);
      if (fb) return `rgba(${fb.r}, ${fb.g}, ${fb.b}, ${formattedAlpha})`;
    }
    return `rgba(255, 107, 0, ${formattedAlpha})`;
  }

  const parsed = parseColor(color);
  if (parsed) {
    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${formattedAlpha})`;
  }

  if (fallbackColor) {
    const fb = parseColor(fallbackColor);
    if (fb) return `rgba(${fb.r}, ${fb.g}, ${fb.b}, ${formattedAlpha})`;
  }

  return color.trim() || `rgba(255, 107, 0, ${formattedAlpha})`;
}

/**
 * Calculates WCAG 2.1 relative luminance according to the official W3C sRGB specification.
 * Returns a value in [0.0, 1.0], where 0 is darkest black and 1 is brightest white.
 */
export function getRelativeLuminance(color: string | undefined | null): number {
  const parsed = parseColor(color);
  if (!parsed) return 0;

  const srgb = (channel: number): number => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const r = srgb(parsed.r);
  const g = srgb(parsed.g);
  const b = srgb(parsed.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates the WCAG 2.1 contrast ratio between two colors.
 * Returns a value in [1.0, 21.0].
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

/**
 * Returns a high-contrast text color (defaults to #1E293B or #FFFFFF) for any background color
 * strictly complying with WCAG 2.1 AA/AAA contrast guidelines.
 *
 * @param color The background color string (Hex, RGB, RGBA, HSL, Named)
 * @param darkColor Preferred dark text color (defaults to '#1E293B')
 * @param lightColor Preferred light text color (defaults to '#FFFFFF')
 * @param surfaceColor Optional underlying card/surface color to composite transparent backgrounds over (defaults to '#FFFFFF')
 */
export function getContrastTextColor(
  color: string | undefined | null,
  darkColor: string = '#1E293B',
  lightColor: string = '#FFFFFF',
  surfaceColor?: string
): string {
  if (!color || typeof color !== 'string') return lightColor;

  const parsed = parseColor(color);
  if (!parsed) return lightColor;

  let effectiveColor = color;
  if (parsed.a < 1) {
    effectiveColor = blendColors(color, surfaceColor || '#FFFFFF');
  }

  const contrastDark = getContrastRatio(effectiveColor, darkColor);
  const contrastLight = getContrastRatio(effectiveColor, lightColor);

  return contrastDark >= contrastLight ? darkColor : lightColor;
}

/**
 * Returns true if the color has relative luminance below the WCAG midpoint (0.179).
 */
export function isDark(color: string | undefined | null): boolean {
  if (!color) return false;
  return getRelativeLuminance(color) < 0.179;
}

/**
 * Returns true if the color is light (relative luminance >= 0.179).
 */
export function isLight(color: string | undefined | null): boolean {
  return !isDark(color);
}

/**
 * Converts any valid hex or color string to an RGBA string.
 */
export function hexToRgba(hex: string, opacity: number = 1): string {
  return withOpacity(hex, opacity);
}

/**
 * Converts any valid color string to a Hex color (#RRGGBB or #RRGGBBAA).
 * @param color Any color string
 * @param includeAlpha Whether to include alpha ('auto' only includes alpha if < 1)
 */
export function rgbaToHex(
  color: string | undefined | null,
  includeAlpha: boolean | 'auto' = true
): string {
  const parsed = parseColor(color);
  if (!parsed) return '#000000';

  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  const hexR = toHex(parsed.r);
  const hexG = toHex(parsed.g);
  const hexB = toHex(parsed.b);

  const shouldIncludeAlpha =
    includeAlpha === true || (includeAlpha === 'auto' && parsed.a < 1);

  if (shouldIncludeAlpha) {
    const hexA = toHex(Math.round(parsed.a * 255));
    return `#${hexR}${hexG}${hexB}${hexA}`;
  }
  return `#${hexR}${hexG}${hexB}`;
}

/**
 * Composites a foreground color with transparency over a solid background color.
 */
export function blendColors(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);

  if (!fg && !bg) return 'rgba(0, 0, 0, 1)';
  if (!fg) return `rgba(${bg!.r}, ${bg!.g}, ${bg!.b}, ${bg!.a})`;
  if (!bg) return `rgba(${fg.r}, ${fg.g}, ${fg.b}, ${fg.a})`;

  const outA = fg.a + bg.a * (1 - fg.a);
  if (outA === 0) return 'rgba(0, 0, 0, 0)';

  const r = Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / outA);
  const g = Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / outA);
  const b = Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / outA);

  return `rgba(${r}, ${g}, ${b}, ${Number(outA.toFixed(4))})`;
}

/**
 * Darkens a color by reducing its RGB components towards black by the given ratio [0.0 - 1.0].
 */
export function darken(color: string, amount: number = 0.1): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const factor = Math.max(0, Math.min(1, 1 - amount));
  const r = Math.round(parsed.r * factor);
  const g = Math.round(parsed.g * factor);
  const b = Math.round(parsed.b * factor);

  return `rgba(${r}, ${g}, ${b}, ${parsed.a})`;
}

/**
 * Lightens a color by shifting its RGB components towards white by the given ratio [0.0 - 1.0].
 */
export function lighten(color: string, amount: number = 0.1): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const factor = Math.max(0, Math.min(1, amount));
  const r = Math.round(parsed.r + (255 - parsed.r) * factor);
  const g = Math.round(parsed.g + (255 - parsed.g) * factor);
  const b = Math.round(parsed.b + (255 - parsed.b) * factor);

  return `rgba(${r}, ${g}, ${b}, ${parsed.a})`;
}
