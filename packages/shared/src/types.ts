import { z } from 'zod';

// ─── Enums / Literals ───────────────────────────────────────────────

export type SessionStatus = 'lobby' | 'running' | 'checkpoint_active' | 'ended';
export type PlayerStatus = 'alive' | 'eliminated' | 'disconnected';

// ─── Ephemeral State (server memory only) ───────────────────────────

export interface AnswerRecord {
  checkpointId: string;
  selectedIndex: number;
  correct: boolean;
  timeTakenMs: number;
  pointsAwarded: number;
}

export interface PlayerState {
  playerId: string;
  displayName: string;
  score: number;
  lives: number;
  status: PlayerStatus;
  answers: AnswerRecord[];
  lastPingMs: number;
  positionX: number;
}

export interface CheckpointState {
  checkpointId: string;
  question: string;
  options: string[];
  correctIndex: number;
  fact: string;
  startedAt: number;
  timerSeconds: number;
  answersReceived: Map<string, { selectedIndex: number; timeTakenMs: number }>;
}

export interface SessionState {
  sessionId: string;
  joinCode: string;
  lessonId: string;
  instructorId: string;
  status: SessionStatus;
  players: Map<string, PlayerState>;
  checkpoints: CheckpointState[];
  currentCheckpointIndex: number;
  createdAt: number;
}

// ─── Leaderboard Entry ──────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  score: number;
  survived: boolean;
  totalTimeMs: number;
}

// ─── Client → Server Messages ───────────────────────────────────────

export const JoinSessionSchema = z.object({
  type: z.literal('join_session'),
  joinCode: z.string().length(6),
  displayName: z.string().min(1).max(20).transform(s => s.trim()),
});

export const SubmitAnswerSchema = z.object({
  type: z.literal('submit_answer'),
  selectedIndex: z.number().int().min(0).max(3),
});

export const PlayerPositionSchema = z.object({
  type: z.literal('player_position'),
  positionX: z.number(),
});

export const PingSchema = z.object({
  type: z.literal('ping'),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinSessionSchema,
  SubmitAnswerSchema,
  PlayerPositionSchema,
  PingSchema,
]);

export type JoinSessionMessage = z.infer<typeof JoinSessionSchema>;
export type SubmitAnswerMessage = z.infer<typeof SubmitAnswerSchema>;
export type PlayerPositionMessage = z.infer<typeof PlayerPositionSchema>;
export type PingMessage = z.infer<typeof PingSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ─── Server → Client Messages (individual) ─────────────────────────

export interface JoinedMessage {
  type: 'joined';
  playerId: string;
  displayName: string;
  sessionStatus: SessionStatus;
  players: { id: string; name: string; status: PlayerStatus }[];
}

export interface AnswerResultMessage {
  type: 'answer_result';
  correct: boolean;
  correctIndex: number;
  pointsAwarded: number;
  livesRemaining: number;
  newStatus: PlayerStatus;
  fact: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface PongMessage {
  type: 'pong';
}

// ─── Server → All Clients (broadcast) ──────────────────────────────

export interface PlayerJoinedMessage {
  type: 'player_joined';
  playerId: string;
  displayName: string;
  playerCount: number;
}

export interface PlayerLeftMessage {
  type: 'player_left';
  playerId: string;
  playerCount: number;
}

export interface GameLaunchedMessage {
  type: 'game_launched';
  totalCheckpoints: number;
}

export interface CheckpointStartMessage {
  type: 'checkpoint_start';
  checkpointIndex: number;
  question: string;
  options: string[];
  timerSeconds: number;
}

export interface CheckpointTickMessage {
  type: 'checkpoint_tick';
  secondsRemaining: number;
}

export interface CheckpointResultsMessage {
  type: 'checkpoint_results';
  correctIndex: number;
  fact: string;
  answerDistribution: Record<number, number>;
  eliminations: { playerId: string; displayName: string }[];
  leaderboard: LeaderboardEntry[];
}

export interface GameResumedMessage {
  type: 'game_resumed';
  nextCheckpointIndex: number;
  playersAlive: number;
}

export interface PlayerPositionsMessage {
  type: 'player_positions';
  positions: { playerId: string; positionX: number }[];
}

export interface SessionEndedMessage {
  type: 'session_ended';
  finalLeaderboard: LeaderboardEntry[];
}

export interface SessionPausedMessage {
  type: 'session_paused';
  reason: string;
}

export interface SessionUnpausedMessage {
  type: 'session_unpaused';
}

// ─── Server → Instructor Only ───────────────────────────────────────

export interface LobbyUpdateMessage {
  type: 'lobby_update';
  players: { id: string; name: string }[];
  playerCount: number;
}

export interface CheckpointAnswersLiveMessage {
  type: 'checkpoint_answers_live';
  answeredCount: number;
  totalAlive: number;
}

// ─── All Server Messages Union ──────────────────────────────────────

export type ServerMessage =
  | JoinedMessage
  | AnswerResultMessage
  | ErrorMessage
  | PongMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | GameLaunchedMessage
  | CheckpointStartMessage
  | CheckpointTickMessage
  | CheckpointResultsMessage
  | GameResumedMessage
  | PlayerPositionsMessage
  | SessionEndedMessage
  | SessionPausedMessage
  | SessionUnpausedMessage
  | LobbyUpdateMessage
  | CheckpointAnswersLiveMessage;

// ─── API Types ──────────────────────────────────────────────────────

export interface LessonRow {
  id: string;
  instructor_id: string;
  title: string;
  timer_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface CheckpointRow {
  id: string;
  lesson_id: string;
  sort_order: number;
  question: string;
  options: string[];
  correct_index: number;
  fact: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  instructor_id: string;
  lesson_id: string;
  join_code: string;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

// ─── Zod Schemas for API ────────────────────────────────────────────

export const CreateLessonSchema = z.object({
  title: z.string().min(1).max(200),
  timer_seconds: z.number().refine(v => [10, 15, 20, 30].includes(v), {
    message: 'timer_seconds must be 10, 15, 20, or 30',
  }),
});

export const UpdateLessonSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  timer_seconds: z.number().refine(v => [10, 15, 20, 30].includes(v), {
    message: 'timer_seconds must be 10, 15, 20, or 30',
  }).optional(),
});

export const CreateCheckpointSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correct_index: z.number().int().min(0).max(3),
  fact: z.string().min(1),
  sort_order: z.number().int().min(0),
});

export const UpdateCheckpointSchema = z.object({
  question: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).length(4).optional(),
  correct_index: z.number().int().min(0).max(3).optional(),
  fact: z.string().min(1).optional(),
});

export const ReorderCheckpointsSchema = z.object({
  checkpoints: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  })),
});

export const CreateSessionSchema = z.object({
  lesson_id: z.string().uuid(),
});
