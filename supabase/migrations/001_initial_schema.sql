-- Dink Shuffle: Initial Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ─── Profiles (extends Supabase auth.users) ─────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT 'male',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Sessions ────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT UNIQUE NOT NULL,
  session_name TEXT DEFAULT '',
  organizer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  game_type TEXT CHECK (game_type IN ('singles', 'doubles')),
  pairing_mode TEXT CHECK (pairing_mode IN ('random', 'mixed')),
  num_rounds INT DEFAULT 3,
  num_courts INT DEFAULT 2,
  court_names JSONB DEFAULT '{}',
  is_shuffled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX idx_sessions_code ON sessions(session_code);
CREATE INDEX idx_sessions_organizer ON sessions(organizer_id);

-- ─── Session Players ─────────────────────────────────────────────────
CREATE TABLE session_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT 'male',
  slot_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, slot_number)
);

CREATE INDEX idx_session_players_session ON session_players(session_id);

-- ─── Rounds ──────────────────────────────────────────────────────────
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  sit_out_player_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, round_number)
);

CREATE INDEX idx_rounds_session ON rounds(session_id);

-- ─── Courts ──────────────────────────────────────────────────────────
CREATE TABLE courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  court_number INT NOT NULL,
  player_ids UUID[] NOT NULL,
  team1_ids UUID[],
  team2_ids UUID[],
  status TEXT CHECK (status IN ('pending', 'playing', 'completed')) DEFAULT 'pending',
  score_team1 INT,
  score_team2 INT,
  score_updated_by TEXT,
  score_updated_at TIMESTAMPTZ,
  UNIQUE(round_id, court_number)
);

CREATE INDEX idx_courts_round ON courts(round_id);
