import { describe, it, expect } from 'vitest';
import { parseOpenQuestions, nextOpenQuestions } from './openQuestions';

describe('parseOpenQuestions', () => {
  it('parses a JSON array of question strings', () => {
    expect(parseOpenQuestions(JSON.stringify(['Q1', 'Q2']))).toEqual(['Q1', 'Q2']);
  });
  it('returns [] for empty, null, or non-array values', () => {
    expect(parseOpenQuestions(null)).toEqual([]);
    expect(parseOpenQuestions(undefined)).toEqual([]);
    expect(parseOpenQuestions('not json')).toEqual([]);
    expect(parseOpenQuestions(JSON.stringify({ a: 1 }))).toEqual([]);
  });
});

describe('nextOpenQuestions', () => {
  it('drops questions the agent resolved', () => {
    expect(nextOpenQuestions(['Q1', 'Q2'], ['Q1'], [])).toEqual(['Q2']);
  });
  it('adds newly surfaced questions without duplicating existing ones', () => {
    expect(nextOpenQuestions(['Q1'], [], ['Q1', 'Q2'])).toEqual(['Q1', 'Q2']);
  });
  it('ignores blank questions and trims whitespace when deduping', () => {
    expect(nextOpenQuestions(['Q1'], [' Q1 '], ['   ', 'Q3'])).toEqual(['Q3']);
  });
});
