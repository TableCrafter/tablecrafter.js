import { describe, it, expect } from 'vitest';
import { createInlineAdapter } from './inline';

describe('adapters/inline', () => {
  it('returns a plain array as-is (same reference, no copy)', async () => {
    const data = [{ id: 1 }, { id: 2 }];
    const loader = createInlineAdapter(data);
    const rows = await loader('ignored-source');
    expect(rows).toBe(data);
  });

  it('resolves a sync provider function on every call', async () => {
    let calls = 0;
    const loader = createInlineAdapter(() => {
      calls++;
      return [{ n: calls }];
    });
    expect(await loader('')).toEqual([{ n: 1 }]);
    expect(await loader('')).toEqual([{ n: 2 }]);
  });

  it('resolves an async provider function', async () => {
    const loader = createInlineAdapter(async () => [{ id: 'async' }]);
    await expect(loader('')).resolves.toEqual([{ id: 'async' }]);
  });

  it('ignores the source string argument', async () => {
    const loader = createInlineAdapter([1, 2, 3]);
    expect(await loader('http://anything.example')).toEqual([1, 2, 3]);
  });

  it('rejects with TypeError when the provider resolves to a non-array', async () => {
    const loader = createInlineAdapter(
      (() => ({ not: 'an array' })) as unknown as () => unknown[]
    );
    await expect(loader('')).rejects.toThrow(TypeError);
  });

  it('empty array round-trips', async () => {
    const loader = createInlineAdapter([]);
    expect(await loader('')).toEqual([]);
  });
});
