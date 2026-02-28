-- Migration: Add 'discarded' to workout status check constraint
-- Phase 19: Workout Logging Core Loop
-- Supports soft-delete of workouts (allows users to abandon a workout without deleting it)

ALTER TABLE workouts DROP CONSTRAINT workouts_status_check;
ALTER TABLE workouts ADD CONSTRAINT workouts_status_check
  CHECK (status IN ('in_progress', 'completed', 'discarded'));
