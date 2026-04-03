-- Track players in each session (replaces in-memory SessionManager player state)
CREATE TABLE session_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  lives INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'eliminated', 'disconnected')),
  total_time_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, player_id)
);

ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read session players"
  ON session_players FOR SELECT USING (true);

CREATE POLICY "Service role can manage session players"
  ON session_players FOR ALL USING (true) WITH CHECK (true);

-- Track individual answers per checkpoint (replaces in-memory answer tracking)
CREATE TABLE session_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  checkpoint_index INT NOT NULL,
  selected_index INT NOT NULL,
  correct BOOLEAN NOT NULL,
  points_awarded INT NOT NULL DEFAULT 0,
  time_taken_ms INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, player_id, checkpoint_index)
);

ALTER TABLE session_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage session answers"
  ON session_answers FOR ALL USING (true) WITH CHECK (true);

-- Add game state columns to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_checkpoint_index INT NOT NULL DEFAULT -1;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS checkpoint_started_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timer_seconds INT;

-- Allow public read on sessions for join lookup
CREATE POLICY "Anyone can read active sessions by join code"
  ON sessions FOR SELECT USING (true);

-- Allow public read on lessons title for join screen
CREATE POLICY "Anyone can read lesson titles"
  ON lessons FOR SELECT USING (true);
