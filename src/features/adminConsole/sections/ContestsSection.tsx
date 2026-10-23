import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAdminResource } from '../../../modules/adminWorkspace/public';
import { ContestAdminContests, CONTEST_STATUS_OPTIONS, type Contest } from '../../ContestAdminContests';
import { contestSelectionReducer, INITIAL_CONTEST_SELECTION } from '../../contestSelection';
import { ADMIN_READS } from '../adminPanelRequests';
import { formatDate, type AdminMessageSink } from '../adminSectionKit';
import { contestStatusLabel, parseWinnerIds } from './contestFormModel';
import { useContestActions } from './useContestActions';
import { useContestEntries } from './useContestEntries';
import { useContestForm } from './useContestForm';

const ENTRIES_PAGE_SIZE = 20;
const NO_CONTESTS: Contest[] = [];

function countByStatus(contests: Contest[]) {
  const stats = { all: contests.length, active: 0, planned: 0, draft: 0, completed: 0, cancelled: 0 };
  for (const contest of contests) {
    if (contest.status in stats && contest.status !== 'all') stats[contest.status as keyof typeof stats] += 1;
  }
  return stats;
}

/** The contests section: list and filters, the editor, entries of the selected contest and winners. */
export function ContestsSection({ onMessage, onCopy }: {
  onMessage: AdminMessageSink;
  onCopy: (text: string, okText?: string) => Promise<void>;
}) {
  const contestsResource = useAdminResource(ADMIN_READS.contests.key, ADMIN_READS.contests.load);
  const contests = contestsResource.data ?? NO_CONTESTS;
  const [selection, dispatchSelection] = useReducer(contestSelectionReducer, INITIAL_CONTEST_SELECTION);
  const { contestId: selectedContestId, winnersText } = selection;
  const [statusFilter, setStatusFilter] = useState('all');
  const editor = useContestForm();
  const { entries, loading: entriesLoading } = useContestEntries(selectedContestId, onMessage);

  const preferredContestRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    dispatchSelection({ type: 'sync', contests, preferredContestId: preferredContestRef.current });
    preferredContestRef.current = undefined;
  }, [contests]);
  useEffect(() => {
    if (contestsResource.error) onMessage({ type: 'err', text: contestsResource.error.message });
  }, [contestsResource.error, onMessage]);
  const { reload } = contestsResource;
  const reloadContests = useCallback(async (preferredContestId?: string) => {
    preferredContestRef.current = preferredContestId;
    await reload();
  }, [reload]);

  const actions = useContestActions({ editor, selectedContestId, winnersText, onMessage, reloadContests,
    onDeselect: () => dispatchSelection({ type: 'select' }) });

  const selectedContest = contests.find(contest => contest.id === selectedContestId);
  const selectedWinnerIds = useMemo(() => parseWinnerIds(winnersText), [winnersText]);
  const selectedWinnerIdSet = useMemo(() => new Set(selectedWinnerIds), [selectedWinnerIds]);
  const approvedEntries = useMemo(() => entries.filter(entry => entry.status === 'approved'), [entries]);
  const entriesPageCount = Math.max(1, Math.ceil(entries.length / ENTRIES_PAGE_SIZE));
  const entriesPage = Math.min(selection.entriesPage, entriesPageCount);
  const visibleEntries = useMemo(
    () => entries.slice((entriesPage - 1) * ENTRIES_PAGE_SIZE, entriesPage * ENTRIES_PAGE_SIZE),
    [entries, entriesPage],
  );
  const stats = useMemo(() => countByStatus(contests), [contests]);
  const filteredContests = useMemo(
    () => (statusFilter === 'all' ? contests : contests.filter(contest => contest.status === statusFilter)),
    [statusFilter, contests],
  );
  const toggleWinner = (profileId: string) => {
    const winners = parseWinnerIds(winnersText);
    const next = winners.includes(profileId) ? winners.filter(id => id !== profileId) : [...winners, profileId];
    dispatchSelection({ type: 'setWinnersText', winnersText: next.join('\n') });
  };
  const { form } = editor;

  return (
    <ContestAdminContests
      view={editor.view}
      onViewChange={editor.setView}
      form={form}
      formRef={editor.formRef}
      onFormChange={editor.patch}
      onSubmit={event => void actions.submit(event)}
      onReset={editor.startNew}
      onStartNow={editor.startNow}
      onStartInHour={editor.startInHour}
      onEndInTenMinutes={editor.endInTenMinutes}
      onEndInHour={editor.endInHour}
      onEndTomorrow={editor.endTomorrow}
      currentStatusLabel={(CONTEST_STATUS_OPTIONS.find(item => item.value === form.status) ?? CONTEST_STATUS_OPTIONS[0]).label}
      previewStartsAt={form.startsAt ? formatDate(form.startsAt) : 'сразу после публикации'}
      previewEndsAt={form.endsAt ? formatDate(form.endsAt) : 'без даты окончания'}
      loading={actions.busy || contestsResource.loading || contestsResource.refreshing}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      stats={stats}
      contests={filteredContests}
      selectedContestId={selectedContestId}
      selectedContest={selectedContest}
      onSelectContest={contest => dispatchSelection({ type: 'select', contest })}
      onEditSelected={() => { if (selectedContest) editor.edit(selectedContest); }}
      onReload={() => void reloadContests()}
      onDelete={contest => void actions.remove(contest)}
      selectedContestEntryCount={selectedContest?.entriesCount ?? entries.length}
      approvedEntryCount={approvedEntries.length}
      selectedWinnerCount={selectedWinnerIds.length}
      entries={entries}
      visibleEntries={visibleEntries}
      entriesLoading={entriesLoading}
      selectedWinnerIds={selectedWinnerIds}
      selectedWinnerIdSet={selectedWinnerIdSet}
      onToggleWinner={toggleWinner}
      onClearWinners={() => dispatchSelection({ type: 'setWinnersText', winnersText: '' })}
      entriesPage={entriesPage}
      entriesPageCount={entriesPageCount}
      onEntriesPageChange={page => dispatchSelection({ type: 'setEntriesPage', entriesPage: page })}
      approvedWinnerCount={approvedEntries.filter(entry => selectedWinnerIdSet.has(entry.profileId)).length}
      onSaveWinners={() => void actions.saveWinners()}
      winnersText={winnersText}
      onWinnersTextChange={text => dispatchSelection({ type: 'setWinnersText', winnersText: text })}
      onCopyProfileId={profileId => void onCopy(profileId, 'ID участника скопирован.')}
      formatDate={formatDate}
      statusLabel={contestStatusLabel}
    />
  );
}
