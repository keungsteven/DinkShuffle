-- Dink Shuffle: Automated Session Cleanup
-- Run this AFTER 003_avatar_storage.sql in the Supabase SQL Editor

-- ─── Cleanup Function ──────────────────────────────────────────────
-- Deletes sessions past their expires_at timestamp.
-- Cascading deletes clean up session_players, rounds, and courts.
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Schedule Hourly Cleanup (requires pg_cron) ────────────────────
-- pg_cron is enabled by default on Supabase.
-- If this fails, enable it in Dashboard → Database → Extensions → pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 * * * *', -- every hour
  'SELECT cleanup_expired_sessions()'
);
