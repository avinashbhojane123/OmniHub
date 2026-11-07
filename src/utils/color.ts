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

const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  cyan: [0, 255, 255, 1],
  orange: [255, 165, 0, 1],
};

function parseAngle(val: number, unit?: string): number {
  if (!unit || unit === 'deg') return val;
  if (unit === 'rad') return (val * 180) / Math.PI;
  if (unit === 'turn') return val * 360;
  if (unit === 'grad') return val * 0.9;
  return val;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const normH = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + normH / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return [f(0), f(8), f(4)];
}

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

export function isValidColor(color: unknown): boolean {
  return typeof color === 'string' && color.trim().length > 0 && parseColor(color) !== null;
}

export function parseColor(color: string | undefined | null): RGBA | null {
  if (!color || typeof color !== 'string') return null;
  const trimmed = color.trim().toLowerCase();
  if (!trimmed) return null;

  if (NAMED_COLORS[trimmed]) {
    const [r, g, b, a] = NAMED_COLORS[trimmed];
    return { r, g, b, a };
  }

  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number((parseInt(hex.slice(6, 8), 16) / 255).toFixed(4)) : 1;
    return { r, g, b, a };
  }

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

  const hslMatch = /^hsla?\(\s*([\d.]+)(deg|rad|turn|grad)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(trimmed);
  if (hslMatch) {
    const h = parseAngle(parseFloat(hslMatch[1]), hslMatch[2]);
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

export function withOpacity(
  color: string | undefined | null,
  opacity: number = 1,
  fallbackColor?: string
): string {
  const clampedOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
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

export function getRelativeLuminance(color: string | undefined | null): number {
  const parsed = parseColor(color);
  if (!parsed) return 0;

  const srgb = (channel: number): number => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * srgb(parsed.r) + 0.7152 * srgb(parsed.g) + 0.0722 * srgb(parsed.b);
}

export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

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

export function isDark(color: string | undefined | null): boolean {
  if (!color) return false;
  return getRelativeLuminance(color) < 0.179;
}

export function isLight(color: string | undefined | null): boolean {
  return !isDark(color);
}

export function hexToRgba(hex: string, opacity: number = 1): string {
  return withOpacity(hex, opacity);
}

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

export function darken(color: string, amount: number = 0.1): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const factor = Math.max(0, Math.min(1, 1 - amount));
  return `rgba(${Math.round(parsed.r * factor)}, ${Math.round(parsed.g * factor)}, ${Math.round(parsed.b * factor)}, ${parsed.a})`;
}

export function lighten(color: string, amount: number = 0.1): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const factor = Math.max(0, Math.min(1, amount));
  return `rgba(${Math.round(parsed.r + (255 - parsed.r) * factor)}, ${Math.round(parsed.g + (255 - parsed.g) * factor)}, ${Math.round(parsed.b + (255 - parsed.b) * factor)}, ${parsed.a})`;
}
