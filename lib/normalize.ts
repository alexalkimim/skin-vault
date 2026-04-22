// Utility function to normalize market_hash_name for consistent matching
// Removes special characters like ★, |, parentheses, and converts to lowercase
export function normalizeMarketHashName(name: string): string {
  return name
    .replace(/[★|\(\)\[\]{}]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
    .toLowerCase();
}