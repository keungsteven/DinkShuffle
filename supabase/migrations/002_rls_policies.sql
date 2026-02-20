-- Dink Shuffle: Row-Level Security Policies
-- Run this AFTER 001_initial_schema.sql in the Supabase SQL Editor

-- ─── Enable RLS on all tables ────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

-- ─── Profiles ────────────────────────────────────────────────────────
-- Anyone can read profiles (for displaying player names)
CREATE POLICY "Public profiles are viewable"
  ON profiles FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Users can only insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ─── Sessions ────────────────────────────────────────────────────────
-- Sessions are readable by anyone (session_code acts as the access token)
CREATE POLICY "Sessions readable by anyone"
  ON sessions FOR SELECT USING (true);

-- Only the organizer can insert sessions (links to their auth.uid)
CREATE POLICY "Authenticated users can create sessions"
  ON sessions FOR INSERT WITH CHECK (auth.uid() = organizer_id);

-- Only the organizer can update/delete their own sessions
CREATE POLICY "Organizer can update own session"
  ON sessions FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "Organizer can delete own session"
  ON sessions FOR DELETE USING (auth.uid() = organizer_id);

-- ─── Session Players ─────────────────────────────────────────────────
-- Players list is visible to all session participants
CREATE POLICY "Session players are viewable"
  ON session_players FOR SELECT USING (true);

-- Organizer can manage all players in their sessions
CREATE POLICY "Organizer manages players"
  ON session_players FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_players.session_id
      AND sessions.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizer updates players"
  ON session_players FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_players.session_id
      AND sessions.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizer deletes players"
  ON session_players FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_players.session_id
      AND sessions.organizer_id = auth.uid()
    )
  );

-- Players can join sessions themselves (self-insert)
CREATE POLICY "Players can join sessions"
  ON session_players FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─── Rounds ──────────────────────────────────────────────────────────
CREATE POLICY "Rounds are viewable"
  ON rounds FOR SELECT USING (true);

CREATE POLICY "Organizer manages rounds"
  ON rounds FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = rounds.session_id
      AND sessions.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizer updates rounds"
  ON rounds FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = rounds.session_id
      AND sessions.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizer deletes rounds"
  ON rounds FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = rounds.session_id
      AND sessions.organizer_id = auth.uid()
    )
  );

-- ─── Courts ──────────────────────────────────────────────────────────
CREATE POLICY "Courts are viewable"
  ON courts FOR SELECT USING (true);

-- Organizer can create courts (via round → session ownership)
CREATE POLICY "Organizer manages courts"
  ON courts FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds
      JOIN sessions ON sessions.id = rounds.session_id
      WHERE rounds.id = courts.round_id
      AND sessions.organizer_id = auth.uid()
    )
  );

-- Any authenticated user can update scores on a court
CREATE POLICY "Authenticated users can update court scores"
  ON courts FOR UPDATE USING (auth.role() = 'authenticated');

-- Organizer can delete courts
CREATE POLICY "Organizer deletes courts"
  ON courts FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rounds
      JOIN sessions ON sessions.id = rounds.session_id
      WHERE rounds.id = courts.round_id
      AND sessions.organizer_id = auth.uid()
    )
  );

-- ─── Match History View ──────────────────────────────────────────────
-- Users can only see their own match history through this view
CREATE OR REPLACE VIEW my_match_history AS
SELECT
  c.id AS court_id,
  c.court_number,
  c.status,
  c.score_team1,
  c.score_team2,
  c.player_ids,
  c.team1_ids,
  c.team2_ids,
  r.round_number,
  s.session_name,
  s.session_code,
  s.game_type,
  s.pairing_mode,
  s.created_at AS session_date
FROM courts c
JOIN rounds r ON r.id = c.round_id
JOIN sessions s ON s.id = r.session_id
JOIN session_players sp ON sp.session_id = s.id
WHERE sp.user_id = auth.uid()
  AND c.player_ids @> ARRAY[sp.id];
