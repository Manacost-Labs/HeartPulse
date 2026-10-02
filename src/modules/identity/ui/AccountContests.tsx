export type AccountContestEntry = {
  id: string;
  contestId: string;
  title: string;
  prize: string;
  imageUrl: string;
  status: string;
  entryStatus: string;
  joinedAt: string;
  isWinner: boolean;
};

const CONTEST_STATUS_TEXT: Record<string, string> = {
  active: 'Идёт',
  planned: 'Скоро',
  completed: 'Завершён',
  cancelled: 'Отменён',
  draft: 'Черновик',
};

function joinedLabel(value: string): string {
  if (!value) return 'дата не указана';
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Contest entries of the viewer; one quiet line until there are any. */
export default function AccountContests({ entries, loading }: { entries: AccountContestEntry[]; loading: boolean }) {
  return (
    <section className="account-card account-contests" aria-labelledby="account-contests-title" data-tour-id="profile-contests">
      <div className="account-contests__head">
        <h2 id="account-contests-title">Конкурсы</h2>
        <a href="/contests/">Текущие конкурсы</a>
      </div>
      {loading ? (
        <p className="account-muted">Загружаем историю…</p>
      ) : entries.length === 0 ? (
        <p className="account-muted">Вы ещё не участвовали в конкурсах. Здесь появятся заявки, результаты и призы.</p>
      ) : (
        <ul className="account-contests__list">
          {entries.map(entry => (
            <li key={entry.id || entry.contestId} className="account-contests__entry">
              {entry.imageUrl && <img src={entry.imageUrl} alt="" loading="lazy" decoding="async" width={56} height={56} />}
              <span className="account-contests__text">
                <strong>{entry.title}</strong>
                <small>
                  {CONTEST_STATUS_TEXT[entry.status] || entry.status}
                  {' · '}
                  {entry.entryStatus === 'approved' ? 'участие одобрено' : entry.entryStatus || 'заявка'}
                  {' · '}
                  заявка от {joinedLabel(entry.joinedAt)}
                </small>
                {entry.prize && <small>Приз: {entry.prize}</small>}
              </span>
              {entry.isWinner && <span className="account-pill account-pill--winner">Победа</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
