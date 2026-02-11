import { describe, it, expect } from 'vitest';
import {
  MILESTONE_THRESHOLDS,
  getNextMilestone,
  isMilestoneStreak,
  getDaysToNextMilestone,
} from '@/lib/habits/milestones';

describe('milestones', () => {
  describe('MILESTONE_THRESHOLDS', () => {
    it('should contain the correct thresholds in order', () => {
      expect(MILESTONE_THRESHOLDS).toEqual([7, 14, 30, 50, 100, 200, 365]);
    });
  });

  describe('getNextMilestone', () => {
    it('returns 7 for streak of 0', () => {
      expect(getNextMilestone(0)).toBe(7);
    });

    it('returns 7 for streak of 5', () => {
      expect(getNextMilestone(5)).toBe(7);
    });

    it('returns 14 for streak of 7', () => {
      expect(getNextMilestone(7)).toBe(14);
    });

    it('returns 30 for streak of 14', () => {
      expect(getNextMilestone(14)).toBe(30);
    });

    it('returns 365 for streak of 200', () => {
      expect(getNextMilestone(200)).toBe(365);
    });

    it('returns null for streak of 365', () => {
      expect(getNextMilestone(365)).toBeNull();
    });

    it('returns null for streak beyond 365', () => {
      expect(getNextMilestone(500)).toBeNull();
    });
  });

  describe('isMilestoneStreak', () => {
    it('returns true for each milestone threshold', () => {
      for (const threshold of MILESTONE_THRESHOLDS) {
        expect(isMilestoneStreak(threshold)).toBe(true);
      }
    });

    it('returns false for non-milestone streaks', () => {
      expect(isMilestoneStreak(0)).toBe(false);
      expect(isMilestoneStreak(1)).toBe(false);
      expect(isMilestoneStreak(6)).toBe(false);
      expect(isMilestoneStreak(8)).toBe(false);
      expect(isMilestoneStreak(15)).toBe(false);
      expect(isMilestoneStreak(99)).toBe(false);
      expect(isMilestoneStreak(366)).toBe(false);
    });
  });

  describe('getDaysToNextMilestone', () => {
    it('returns 7 for streak of 0', () => {
      expect(getDaysToNextMilestone(0)).toBe(7);
    });

    it('returns 2 for streak of 5', () => {
      expect(getDaysToNextMilestone(5)).toBe(2);
    });

    it('returns 7 for streak of 7 (next is 14)', () => {
      expect(getDaysToNextMilestone(7)).toBe(7);
    });

    it('returns 165 for streak of 200 (next is 365)', () => {
      expect(getDaysToNextMilestone(200)).toBe(165);
    });

    it('returns null when no next milestone', () => {
      expect(getDaysToNextMilestone(365)).toBeNull();
      expect(getDaysToNextMilestone(500)).toBeNull();
    });
  });
});
