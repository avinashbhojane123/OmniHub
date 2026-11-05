export function sanitizeAvatarUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const maxLen = Number(process.env.AVATAR_URL_MAX_LENGTH) || 2048;
  if (trimmed.length > maxLen) return null;
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
