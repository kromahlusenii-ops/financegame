-- instructor_profiles
CREATE TABLE instructor_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE instructor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON instructor_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON instructor_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON instructor_profiles FOR UPDATE
  USING (auth.uid() = id);

-- lessons
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructor_profiles(id),
  title TEXT NOT NULL,
  timer_seconds INT NOT NULL DEFAULT 15 CHECK (timer_seconds IN (10, 15, 20, 30)),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can read own lessons"
  ON lessons FOR SELECT
  USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors can insert own lessons"
  ON lessons FOR INSERT
  WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Instructors can update own lessons"
  ON lessons FOR UPDATE
  USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors can delete own lessons"
  ON lessons FOR DELETE
  USING (auth.uid() = instructor_id);

-- checkpoints
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sort_order INT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  fact TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lesson_id, sort_order)
);

ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can read checkpoints for own lessons"
  ON checkpoints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lessons WHERE lessons.id = checkpoints.lesson_id AND lessons.instructor_id = auth.uid()
    )
  );

CREATE POLICY "Instructors can insert checkpoints for own lessons"
  ON checkpoints FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lessons WHERE lessons.id = checkpoints.lesson_id AND lessons.instructor_id = auth.uid()
    )
  );

CREATE POLICY "Instructors can update checkpoints for own lessons"
  ON checkpoints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lessons WHERE lessons.id = checkpoints.lesson_id AND lessons.instructor_id = auth.uid()
    )
  );

CREATE POLICY "Instructors can delete checkpoints for own lessons"
  ON checkpoints FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM lessons WHERE lessons.id = checkpoints.lesson_id AND lessons.instructor_id = auth.uid()
    )
  );

-- sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructor_profiles(id),
  lesson_id UUID NOT NULL REFERENCES lessons(id),
  join_code CHAR(6) NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','running','checkpoint_active','ended')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can read own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors can insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = instructor_id);

CREATE POLICY "Instructors can update own sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = instructor_id);

CREATE POLICY "Instructors can delete own sessions"
  ON sessions FOR DELETE
  USING (auth.uid() = instructor_id);

-- session_checkpoint_results (aggregate only, no student names)
CREATE TABLE session_checkpoint_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  checkpoint_id UUID NOT NULL REFERENCES checkpoints(id),
  answer_distribution JSONB NOT NULL,
  total_answered INT NOT NULL,
  total_correct INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE session_checkpoint_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can read own session results"
  ON session_checkpoint_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = session_checkpoint_results.session_id AND sessions.instructor_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert session results"
  ON session_checkpoint_results FOR INSERT
  WITH CHECK (true);
