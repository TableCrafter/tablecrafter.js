# RFC-v3 Amendments

Status: Approved
RFC base: docs/RFC-v3.md

---

## Amendment 1: Multi-key sort state (SortState[])

**Approved by:** v3-sorting orchestrator (Phase 2, T2.1)
**Implemented in:** `feat/v3-sorting` (PR #323)
**Files changed:** `src/core/types.ts`, `src/core/state.ts`, `src/core/store.contract.test.ts`, `src/core/state.test.ts`

### Motivation

RFC section 2 maps "multi-column sort, comparators" to the `sorting/` module.
The original contract stored `TableState.sort` as `SortState | null`, which
can represent only a single active key.  v2's `sortKeys` array and
`sort(field, { append: true })` ergonomics require an ordered priority list.
Shipping the sorting module without this change would have left multi-column
sort permanently unimplementable via the public `Store.sort()` helper.

### Changes to frozen contract

#### `src/core/types.ts`

1. **New type `SortOptions`**
   ```ts
   export interface SortOptions {
     append?: boolean | undefined;
   }
   ```

2. **`TableState.sort`**: `SortState | null` → `SortState[]`
   - Empty array replaces `null` as the "no sort" sentinel.
   - The array is in priority order: index 0 is the primary sort key.

3. **`Store.sort` signature**: added third parameter
   ```ts
   // Before
   sort(column: string, direction?: SortDirection): void;
   // After
   sort(column: string, direction?: SortDirection, opts?: SortOptions): void;
   ```
   When `opts.append === true`, the call pushes/updates a key in the priority
   list instead of replacing all keys.  This is a non-breaking addition.

4. **`SortPayload`**: added `opts` field
   ```ts
   opts?: SortOptions | undefined;
   ```
   `dispatch({ type: 'SORT', payload: { column, opts: { append: true } } })`
   is now the action-based equivalent of `store.sort(column, undefined, { append: true })`.

5. **`TableCrafterEventMap['sort']`**: `SortState` → `SortState[]`
   The `sort` event now carries the full priority list so listeners can
   re-render all sort indicators in one pass.

### Semantics (v2 parity)

`store.sort(column, direction?, opts?)` behaviour mirrors v2
`sort(field, { append, direction })` exactly:

| call | append | result |
|---|---|---|
| `sort('A')` on empty | false | `[{A, asc}]` |
| `sort('A')` when `[{A,asc}]` | false | `[{A, desc}]` (toggle) |
| `sort('A')` when `[{A,asc},{B,asc}]` | false | `[{A, asc}]` (reset, no toggle on multi-key) |
| `sort('B', undefined, {append:true})` when `[{A,asc}]` | true | `[{A,asc},{B,asc}]` |
| `sort('A', undefined, {append:true})` when `[{A,asc},{B,asc}]` | true | `[{A,desc},{B,asc}]` (toggle in-place) |

### Contract test updated

`store.contract.test.ts` now asserts:
- `Store.sort` parameter 2 is `SortOptions | undefined`
- `TableState.sort` is `SortState[]`

All other contract assertions are unchanged.

### Impact on Phase 2 agents

- `sorting/` (T2.1): owns the change; implements `nextSortState(SortState[], ...)`.
- All other T2.x agents: read-only on `state.sort`; no code changes required
  (they do not inspect the sort shape).
- `render/dom.ts` (Phase 3): must iterate `state.sort` rather than checking
  `state.sort !== null`; the renderer should call `getSortBadges(state)` from
  the sorting module to derive badge numbers.

---

## No other amendments

All other RFC-v3 contracts remain frozen as of Phase 1.
