// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFavorites, addFavorite, removeFavorite, isFavorite, toggleFavorite, type Favorite } from '../favorites';

describe('favorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getFavorites', () => {
    it('returns empty array when nothing stored', () => {
      expect(getFavorites()).toEqual([]);
    });

    it('returns parsed favorites from localStorage', () => {
      const favs: Favorite[] = [{ path: '/r/v1~pods/default/nginx', title: 'nginx', kind: 'Pod', addedAt: 1000 }];
      localStorage.setItem('openshiftpulse-favorites', JSON.stringify(favs));
      expect(getFavorites()).toEqual(favs);
    });

    it('returns empty array on invalid JSON', () => {
      localStorage.setItem('openshiftpulse-favorites', '{bad json');
      expect(getFavorites()).toEqual([]);
    });
  });

  describe('addFavorite', () => {
    it('adds a favorite with addedAt timestamp', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      addFavorite({ path: '/r/v1~pods/default/nginx', title: 'nginx', kind: 'Pod' });
      const favs = getFavorites();
      expect(favs).toHaveLength(1);
      expect(favs[0]).toEqual({
        path: '/r/v1~pods/default/nginx',
        title: 'nginx',
        kind: 'Pod',
        addedAt: now,
      });
      vi.restoreAllMocks();
    });

    it('prepends new favorite to the front', () => {
      addFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      addFavorite({ path: '/b', title: 'B', kind: 'Pod' });
      const favs = getFavorites();
      expect(favs[0].path).toBe('/b');
      expect(favs[1].path).toBe('/a');
    });

    it('does not add duplicate path', () => {
      addFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      addFavorite({ path: '/a', title: 'A different', kind: 'Pod' });
      expect(getFavorites()).toHaveLength(1);
    });

    it('caps at 20 favorites', () => {
      for (let i = 0; i < 25; i++) {
        addFavorite({ path: `/r/${i}`, title: `Item ${i}`, kind: 'Pod' });
      }
      expect(getFavorites()).toHaveLength(20);
    });

    it('stores namespace when provided', () => {
      addFavorite({ path: '/r/v1~pods/ns/p', title: 'p', kind: 'Pod', namespace: 'ns' });
      expect(getFavorites()[0].namespace).toBe('ns');
    });
  });

  describe('removeFavorite', () => {
    it('removes favorite by path', () => {
      addFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      addFavorite({ path: '/b', title: 'B', kind: 'Pod' });
      removeFavorite('/a');
      const favs = getFavorites();
      expect(favs).toHaveLength(1);
      expect(favs[0].path).toBe('/b');
    });

    it('does nothing when path not found', () => {
      addFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      removeFavorite('/nonexistent');
      expect(getFavorites()).toHaveLength(1);
    });
  });

  describe('isFavorite', () => {
    it('returns true for existing favorite', () => {
      addFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      expect(isFavorite('/a')).toBe(true);
    });

    it('returns false for non-existing path', () => {
      expect(isFavorite('/nonexistent')).toBe(false);
    });
  });

  describe('toggleFavorite', () => {
    it('adds and returns true when not favorited', () => {
      const result = toggleFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      expect(result).toBe(true);
      expect(isFavorite('/a')).toBe(true);
    });

    it('removes and returns false when already favorited', () => {
      addFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      const result = toggleFavorite({ path: '/a', title: 'A', kind: 'Pod' });
      expect(result).toBe(false);
      expect(isFavorite('/a')).toBe(false);
    });
  });
});
