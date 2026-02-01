-- Add metadata column to sessions for storing page counts, character counts, etc.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
