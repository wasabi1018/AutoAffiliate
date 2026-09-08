import { describe, expect, it } from 'vitest';

import { selectTargetGenreIndex } from '../supabase/functions/_shared/genre-selection';

describe('selectTargetGenreIndex', () => {
  it('selects a stable genre for retries of the same post set', () => {
    const key = 'c55446e5-92d8-4d4a-b2f1-07db2f39c225';
    expect(selectTargetGenreIndex(3, key)).toBe(selectTargetGenreIndex(3, key));
    expect(selectTargetGenreIndex(3, key)).toBeLessThan(3);
  });

  it('requires at least one target genre', () => {
    expect(() => selectTargetGenreIndex(0, 'post-set')).toThrow(RangeError);
  });
});
