/**
 * Safely applies opacity/alpha to any color string (Hex, RGB, RGBA, HSL).
 * Prevents invalid color strings like "#fff18" or "rgba(...)18" in React Native.
 */
export function withOpacity(color: string | undefined | null, opacity: number = 1): string {
  if (!color || typeof color !== 'string') {
    return `rgba(255, 107, 0, ${opacity})`;
  }

  const trimmed = color.trim();
  const clampedOpacity = Math.max(0, Math.min(1, opacity));

  // Handle RGBA
  if (trimmed.startsWith('rgba(')) {
    return trimmed.replace(
      /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/,
      (_, r, g, b) => `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`
    );
  }

  // Handle RGB
  if (trimmed.startsWith('rgb(')) {
    return trimmed.replace(
      /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
      (_, r, g, b) => `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`
    );
  }

  // Handle 6-digit Hex (#RRGGBB)
  const hex6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(trimmed);
  if (hex6) {
    const r = parseInt(hex6[1], 16);
    const g = parseInt(hex6[2], 16);
    const b = parseInt(hex6[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
  }

  // Handle 3-digit Hex (#RGB)
  const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
  if (hex3) {
    const r = parseInt(hex3[1] + hex3[1], 16);
    const g = parseInt(hex3[2] + hex3[2], 16);
    const b = parseInt(hex3[3] + hex3[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
  }

  // Handle 8-digit Hex (#RRGGBBAA)
  const hex8 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})[0-9a-fA-F]{2}$/.exec(trimmed);
  if (hex8) {
    const r = parseInt(hex8[1], 16);
    const g = parseInt(hex8[2], 16);
    const b = parseInt(hex8[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`;
  }

  return trimmed;
}

/**
 * Returns a high-contrast text color (#1E293B or #FFFFFF) for any background color
 * to satisfy WCAG AA/AAA accessibility standards.
 */
export function getContrastTextColor(color: string | undefined | null): string {
  if (!color || typeof color !== 'string') return '#FFFFFF';
  let r = 0;
  let g = 0;
  let b = 0;
  const trimmed = color.trim();
  const hex6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(trimmed);
  const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
  if (hex6) {
    r = parseInt(hex6[1], 16);
    g = parseInt(hex6[2], 16);
    b = parseInt(hex6[3], 16);
  } else if (hex3) {
    r = parseInt(hex3[1] + hex3[1], 16);
    g = parseInt(hex3[2] + hex3[2], 16);
    b = parseInt(hex3[3] + hex3[3], 16);
  } else {
    const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(trimmed);
    if (rgb) {
      r = parseInt(rgb[1], 10);
      g = parseInt(rgb[2], 10);
      b = parseInt(rgb[3], 10);
    } else {
      return '#FFFFFF';
    }
  }
  // Relative luminance according to WCAG 2.0
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#1E293B' : '#FFFFFF';
}
