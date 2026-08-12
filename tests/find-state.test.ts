import { describe, expect, it } from 'vitest';
import {
  CLOSED_FIND,
  closedFind,
  findForQuery,
  findWithMatchCase,
  findWithMatches,
  openedFind,
} from '../electron/main/find-state';

describe('the find bar as a state machine', () => {
  it('opens without inventing a search', () => {
    const state = openedFind(CLOSED_FIND);
    expect(state.isOpen).toBe(true);
    expect(state.query).toBe('');
  });

  it('keeps the counts a search produced', () => {
    const searching = findWithMatches(findForQuery(CLOSED_FIND, 'the'), 2, 9);
    expect(searching).toMatchObject({ query: 'the', activeMatch: 2, totalMatches: 9 });
  });

  // Deleting the query is not a search with no results; leaving the old counts
  // on screen would report matches for text no longer being searched for.
  it('clears the counts when the query is emptied', () => {
    const searching = findWithMatches(findForQuery(CLOSED_FIND, 'the'), 2, 9);
    const emptied = findForQuery(searching, '');
    expect(emptied).toMatchObject({ query: '', activeMatch: 0, totalMatches: 0 });
    expect(emptied.isOpen).toBe(true);
  });

  it('closes back to nothing', () => {
    const searching = findWithMatches(findForQuery(CLOSED_FIND, 'the'), 2, 9);
    expect(closedFind(searching)).toMatchObject({ isOpen: false, query: '', activeMatch: 0, totalMatches: 0 });
  });

  // Match case is a preference about how the user searches, not part of any one
  // search, so closing the bar must not quietly reset it.
  it('carries match case across a close', () => {
    const strict = findWithMatchCase(findForQuery(CLOSED_FIND, 'the'), true);
    expect(closedFind(strict).matchCase).toBe(true);
  });

  it('leaves the query alone when match case changes', () => {
    const strict = findWithMatchCase(findForQuery(CLOSED_FIND, 'the'), true);
    expect(strict.query).toBe('the');
  });

  it('never mutates the state it was given', () => {
    const before = findForQuery(CLOSED_FIND, 'the');
    const snapshot = { ...before };
    findWithMatches(before, 5, 5);
    closedFind(before);
    expect(before).toEqual(snapshot);
  });
});
