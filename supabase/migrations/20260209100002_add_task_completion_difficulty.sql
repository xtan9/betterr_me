-- BetterR.Me Vertical Depth — Task Completion Difficulty
-- Optional post-completion reflection: 1=easy, 2=good, 3=hard

ALTER TABLE tasks ADD COLUMN completion_difficulty INTEGER
  CHECK (completion_difficulty >= 1 AND completion_difficulty <= 3);

COMMENT ON COLUMN tasks.completion_difficulty IS '1=easy, 2=good, 3=hard — optional post-completion reflection';
