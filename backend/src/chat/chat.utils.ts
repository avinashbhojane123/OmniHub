export function sanitizeAvatarUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.length > 2048) return null;
  if (/data:image\/svg/i.test(trimmed)) return null;
  if (
    /^(https?:\/\/|\/uploads\/|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }
  return null;
}
