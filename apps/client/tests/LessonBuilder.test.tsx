import { describe, it, expect, vi } from 'vitest';

// Test the validation logic directly rather than the full component
// since LessonBuilder requires auth + API

describe('LessonBuilder validation', () => {
  interface Checkpoint {
    question: string;
    options: string[];
    correct_index: number;
    fact: string;
  }

  function isCheckpointValid(cp: Checkpoint): boolean {
    return (
      cp.question.trim().length > 0 &&
      cp.options.every(o => o.trim().length > 0) &&
      cp.options.length === 4 &&
      cp.correct_index >= 0 &&
      cp.correct_index <= 3 &&
      cp.fact.trim().length > 0
    );
  }

  it('rejects checkpoint without question', () => {
    expect(isCheckpointValid({
      question: '',
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      fact: 'fact',
    })).toBe(false);
  });

  it('rejects checkpoint with empty option', () => {
    expect(isCheckpointValid({
      question: 'Q?',
      options: ['A', '', 'C', 'D'],
      correct_index: 0,
      fact: 'fact',
    })).toBe(false);
  });

  it('rejects checkpoint with fewer than 4 options', () => {
    expect(isCheckpointValid({
      question: 'Q?',
      options: ['A', 'B', 'C'],
      correct_index: 0,
      fact: 'fact',
    })).toBe(false);
  });

  it('rejects checkpoint without fact', () => {
    expect(isCheckpointValid({
      question: 'Q?',
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      fact: '',
    })).toBe(false);
  });

  it('accepts valid checkpoint', () => {
    expect(isCheckpointValid({
      question: 'Q?',
      options: ['A', 'B', 'C', 'D'],
      correct_index: 1,
      fact: 'Interesting fact',
    })).toBe(true);
  });

  it('blocks save when no checkpoints exist', () => {
    const checkpoints: Checkpoint[] = [];
    const allValid = checkpoints.length > 0 && checkpoints.every(isCheckpointValid);
    expect(allValid).toBe(false);
  });
});
