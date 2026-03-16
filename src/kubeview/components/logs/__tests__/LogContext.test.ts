import { describe, it, expect } from 'vitest';
import type { ParsedLogLine } from '../LogParser';

// Extract context extraction logic from LogContext
const CONTEXT_LINES = 5;

function getContextLines(allLines: ParsedLogLine[], lineIndex: number) {
  const start = Math.max(0, lineIndex - CONTEXT_LINES);
  const end = Math.min(allLines.length, lineIndex + CONTEXT_LINES + 1);
  return allLines.slice(start, end).map((l, i) => ({
    line: l,
    index: start + i,
    isSelected: start + i === lineIndex,
  }));
}

function formatLogLine(l: ParsedLogLine): string {
  const ts = l.timestamp ? l.timestamp.toISOString() + ' ' : '';
  const level = l.level && l.level !== 'unknown' ? `[${l.level.toUpperCase()}] ` : '';
  return `${ts}${level}${l.message}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

function makeLine(message: string, overrides: Partial<ParsedLogLine> = {}): ParsedLogLine {
  return {
    raw: message,
    message,
    timestamp: undefined,
    level: undefined,
    fields: {},
    format: 'plain',
    ...overrides,
  };
}

const lines: ParsedLogLine[] = Array.from({ length: 20 }, (_, i) =>
  makeLine(`Line ${i}`)
);

describe('getContextLines', () => {
  it('returns 5 lines before and after', () => {
    const context = getContextLines(lines, 10);
    expect(context).toHaveLength(11); // 5 before + selected + 5 after
    expect(context[0].index).toBe(5);
    expect(context[10].index).toBe(15);
  });

  it('marks selected line', () => {
    const context = getContextLines(lines, 10);
    const selected = context.find((c) => c.isSelected);
    expect(selected).toBeDefined();
    expect(selected!.index).toBe(10);
  });

  it('clamps at start of array', () => {
    const context = getContextLines(lines, 2);
    expect(context[0].index).toBe(0);
    expect(context.find((c) => c.isSelected)!.index).toBe(2);
  });

  it('clamps at end of array', () => {
    const context = getContextLines(lines, 18);
    expect(context[context.length - 1].index).toBe(19);
    expect(context.find((c) => c.isSelected)!.index).toBe(18);
  });

  it('handles first line', () => {
    const context = getContextLines(lines, 0);
    expect(context[0].index).toBe(0);
    expect(context[0].isSelected).toBe(true);
  });

  it('handles last line', () => {
    const context = getContextLines(lines, 19);
    expect(context[context.length - 1].index).toBe(19);
    expect(context[context.length - 1].isSelected).toBe(true);
  });
});

describe('formatLogLine', () => {
  it('formats plain message', () => {
    const line = makeLine('hello world');
    expect(formatLogLine(line)).toBe('hello world');
  });

  it('formats with timestamp', () => {
    const ts = new Date('2026-01-15T10:30:00.000Z');
    const line = makeLine('test', { timestamp: ts });
    expect(formatLogLine(line)).toContain('2026-01-15');
    expect(formatLogLine(line)).toContain('test');
  });

  it('formats with level', () => {
    const line = makeLine('error occurred', { level: 'error' });
    expect(formatLogLine(line)).toBe('[ERROR] error occurred');
  });

  it('formats with timestamp and level', () => {
    const ts = new Date('2026-01-15T10:30:00.000Z');
    const line = makeLine('msg', { timestamp: ts, level: 'warn' });
    const formatted = formatLogLine(line);
    expect(formatted).toContain('[WARN]');
    expect(formatted).toContain('msg');
    expect(formatted).toContain('2026-01-15');
  });

  it('skips unknown level', () => {
    const line = makeLine('msg', { level: 'unknown' });
    expect(formatLogLine(line)).toBe('msg');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => expect(formatDuration(500)).toBe('500ms'));
  it('formats seconds', () => expect(formatDuration(5000)).toBe('5s'));
  it('formats minutes', () => expect(formatDuration(120000)).toBe('2m'));
  it('formats hours', () => expect(formatDuration(7200000)).toBe('2h'));
});
