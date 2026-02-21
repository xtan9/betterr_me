import { describe, it, expect } from 'vitest';
import { getBottomSortOrder, getSortOrderBetween, SORT_ORDER_GAP } from '@/lib/tasks/sort-order';

describe('sort-order utilities', () => {
  describe('SORT_ORDER_GAP', () => {
    it('equals 65536.0', () => {
      expect(SORT_ORDER_GAP).toBe(65536.0);
    });
  });

  describe('getBottomSortOrder', () => {
    it('returns 65536.0 when currentMax is null', () => {
      expect(getBottomSortOrder(null)).toBe(65536.0);
    });

    it('returns 65536.0 when currentMax is 0', () => {
      expect(getBottomSortOrder(0)).toBe(65536.0);
    });

    it('returns 131072.0 when currentMax is 65536.0', () => {
      expect(getBottomSortOrder(65536.0)).toBe(131072.0);
    });
  });

  describe('getSortOrderBetween', () => {
    it('returns 32768.0 for between 0 and 65536.0', () => {
      expect(getSortOrderBetween(0, 65536.0)).toBe(32768.0);
    });

    it('returns 98304.0 for between 65536.0 and 131072.0', () => {
      expect(getSortOrderBetween(65536.0, 131072.0)).toBe(98304.0);
    });
  });
});
