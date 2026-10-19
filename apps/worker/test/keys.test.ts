import { describe, expect, test } from 'bun:test';
import { nextAvailableName } from '../src/lib/keys';

describe('nextAvailableName', () => {
  test('keeps a name nobody has used', () => {
    expect(nextAvailableName(new Set(), 'a.pdf')).toBe('a.pdf');
  });

  test('suffixes a taken name before the extension', () => {
    expect(nextAvailableName(new Set(['a.pdf']), 'a.pdf')).toBe('a_2.pdf');
  });

  test('counts past suffixes that are taken too', () => {
    const used = new Set(['a.pdf', 'a_2.pdf', 'a_3.pdf']);
    expect(nextAvailableName(used, 'a.pdf')).toBe('a_4.pdf');
  });

  test('only treats the last dot as the extension', () => {
    const used = new Set(['2026.03.15-X.pdf']);
    expect(nextAvailableName(used, '2026.03.15-X.pdf')).toBe(
      '2026.03.15-X_2.pdf',
    );
  });

  test('handles names without an extension', () => {
    expect(nextAvailableName(new Set(['a']), 'a')).toBe('a_2');
  });
});
