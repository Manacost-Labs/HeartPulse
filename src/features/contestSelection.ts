export type ContestSelectionContest = {
  id: string;
  winners?: readonly string[];
};

export type ContestSelectionState = {
  contestId: string;
  winnersText: string;
  sourceWinnersText: string;
  entriesPage: number;
};

export type ContestSelectionAction =
  | { type: 'sync'; contests: readonly ContestSelectionContest[]; preferredContestId?: string }
  | { type: 'select'; contest?: ContestSelectionContest }
  | { type: 'setWinnersText'; winnersText: string }
  | { type: 'setEntriesPage'; entriesPage: number };

export const INITIAL_CONTEST_SELECTION: ContestSelectionState = {
  contestId: '',
  winnersText: '',
  sourceWinnersText: '',
  entriesPage: 1,
};

function stateFromContest(contest?: ContestSelectionContest): ContestSelectionState {
  if (!contest) return INITIAL_CONTEST_SELECTION;
  const sourceWinnersText = contest.winners?.join('\n') ?? '';
  return {
    contestId: contest.id,
    winnersText: sourceWinnersText,
    sourceWinnersText,
    entriesPage: 1,
  };
}

export function contestSelectionReducer(
  state: ContestSelectionState,
  action: ContestSelectionAction,
): ContestSelectionState {
  if (action.type === 'sync') {
    const preferred = action.preferredContestId
      ? action.contests.find(contest => contest.id === action.preferredContestId)
      : undefined;
    const selected = preferred
      ?? action.contests.find(contest => contest.id === state.contestId)
      ?? action.contests[0];
    if (!selected) return INITIAL_CONTEST_SELECTION;
    const sourceWinnersText = selected.winners?.join('\n') ?? '';
    if (selected.id === state.contestId && sourceWinnersText === state.sourceWinnersText) return state;
    return stateFromContest(selected);
  }

  if (action.type === 'select') {
    if (action.contest?.id === state.contestId) return state;
    return stateFromContest(action.contest);
  }

  if (action.type === 'setWinnersText') {
    if (action.winnersText === state.winnersText) return state;
    return { ...state, winnersText: action.winnersText };
  }

  const entriesPage = Math.max(1, Math.floor(action.entriesPage));
  if (entriesPage === state.entriesPage) return state;
  return { ...state, entriesPage };
}
