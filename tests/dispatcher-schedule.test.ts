import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const dispatcherSource = readFileSync(
  new URL('../supabase/functions/dispatcher/index.ts', import.meta.url),
  'utf8',
);

describe('dispatcher schedule query', () => {
  it('evaluates every selected posting time on every selected weekday', () => {
    expect(dispatcherSource).toContain('unnest(s.weekdays)');
    expect(dispatcherSource).toContain('unnest(s.posting_times)');
    expect(dispatcherSource).not.toContain('s.weekdays[i]');
    expect(dispatcherSource).not.toContain('s.posting_times[i]');
  });
});
