/**
 * src/utils/portfolioColors.ts
 *
 * Deterministic color-blind-friendly palette and stable hashing.
 * Colors are assigned purely based on key hash into a 16+ color palette.
 * "Other" slice is always neutral gray #64748B.
 * No hardcoded tickers or signature company colors.
 */

export const COLORBLIND_PALETTE: readonly string[] = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#84CC16', // Lime
  '#A855F7', // Violet
  '#E11D48', // Rose
  '#0284C7', // Sky
  '#D97706', // Ochre
  '#4F46E5', // Deep Indigo
  '#059669', // Dark Green
  '#2563EB', // Cobalt
  '#7C3AED'  // Deep Violet
];

export const OTHER_GRAY = '#64748B';

/**
 * Returns a stable, deterministic color from the color-blind-friendly palette.
 * Uses DJB2 hash of the trimmed uppercase key string.
 * Output is guaranteed to never shuffle when other items are added, removed, or reordered.
 */
export function getStableColor(key: string): string {
  if (!key) return OTHER_GRAY;
  const clean = key.trim();
  if (clean.toLowerCase().startsWith('other')) {
    return OTHER_GRAY;
  }

  const upper = clean.toUpperCase();
  let hash = 5381;
  for (let i = 0; i < upper.length; i++) {
    hash = ((hash << 5) + hash) + upper.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLORBLIND_PALETTE.length;
  return COLORBLIND_PALETTE[index];
}

export function getTickerColor(ticker: string): string {
  return getStableColor(ticker);
}

export function getSectorColor(sector: string): string {
  return getStableColor(sector);
}
