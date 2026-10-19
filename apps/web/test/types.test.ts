import { describe, expect, test } from 'bun:test';
import type { FileEntry, ParseResult } from '@org/shared-types';
import { sortEntries, statusColor } from '../src/lib/types';

function entry(
  id: string,
  result: Partial<ParseResult> | null,
  filename = 'x.pdf',
): FileEntry {
  return {
    fileId: id,
    originalName: `${id}.pdf`,
    status: result ? 'parsed' : 'parsing',
    result: result && ({ confident: true, ...result } as ParseResult),
    filename,
    alreadyProcessed: null,
  };
}

describe('statusColor', () => {
  test('red while parsing or without a filename', () => {
    expect(statusColor(entry('a', null))).toBe('red');
    expect(statusColor(entry('a', { confident: true }, ''))).toBe('red');
  });

  test('amber when parsed but not confident', () => {
    expect(statusColor(entry('a', { confident: false }))).toBe('amber');
  });

  test('green when parsed, named and confident', () => {
    expect(statusColor(entry('a', { confident: true }))).toBe('green');
  });
});

describe('sortEntries', () => {
  test('puts files that need attention first and keeps upload order within a colour', () => {
    const entries = [
      entry('green1', { confident: true }),
      entry('amber1', { confident: false }),
      entry('red1', null),
      entry('green2', { confident: true }),
      entry('red2', null),
    ];

    expect(sortEntries(entries).map((e) => e.fileId)).toEqual([
      'red1',
      'red2',
      'amber1',
      'green1',
      'green2',
    ]);
  });

  test('does not reorder the array it was given', () => {
    const entries = [entry('green', { confident: true }), entry('red', null)];

    sortEntries(entries);

    expect(entries.map((e) => e.fileId)).toEqual(['green', 'red']);
  });
});
