import type { FindState } from '../../shared/types';

export const CLOSED_FIND: FindState = {
  isOpen: false,
  query: '',
  activeMatch: 0,
  totalMatches: 0,
  matchCase: false,
  wholeWord: false,
  isWholeWordUnavailable: false,
};

export function openedFind(state: FindState): FindState {
  return { ...state, isOpen: true };
}

/** An empty query is not a search with no results; it is no search at all. */
export function findForQuery(state: FindState, query: string): FindState {
  const next = { ...state, isOpen: true, query };
  if (query) {
    return next;
  }
  return { ...next, activeMatch: 0, totalMatches: 0 };
}

export function findWithMatchCase(state: FindState, matchCase: boolean): FindState {
  return { ...state, matchCase };
}

export function findWithWholeWord(state: FindState, wholeWord: boolean): FindState {
  return { ...state, wholeWord };
}

export function findWithMatches(state: FindState, activeMatch: number, totalMatches: number): FindState {
  return { ...state, activeMatch, totalMatches };
}

/** Match case and whole words survive closing the bar: they are preferences, not part of one search. */
export function closedFind(state: FindState): FindState {
  return { ...CLOSED_FIND, matchCase: state.matchCase, wholeWord: state.wholeWord };
}
