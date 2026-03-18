/**
 * Favorites system — star resources for quick access
 */

export interface Favorite {
  path: string;
  title: string;
  kind: string;
  namespace?: string;
  addedAt: number;
}

const STORAGE_KEY = 'shiftops-favorites';

export function getFavorites(): Favorite[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addFavorite(fav: Omit<Favorite, 'addedAt'>): void {
  const favorites = getFavorites();
  if (favorites.some((f) => f.path === fav.path)) return;
  favorites.unshift({ ...fav, addedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.slice(0, 20)));
}

export function removeFavorite(path: string): void {
  const favorites = getFavorites().filter((f) => f.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

export function isFavorite(path: string): boolean {
  return getFavorites().some((f) => f.path === path);
}

export function toggleFavorite(fav: Omit<Favorite, 'addedAt'>): boolean {
  if (isFavorite(fav.path)) {
    removeFavorite(fav.path);
    return false;
  }
  addFavorite(fav);
  return true;
}
