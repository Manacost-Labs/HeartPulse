import { formatAnalyticsDate, formatRub } from './boostyAnalyticsModel';
import type { BoostySalesAnalyticsSource } from './ContestAdminAnalytics';

type ContestAdminBoostySalesProps = {
  sales: BoostySalesAnalyticsSource | null;
  loading: boolean;
};

export function ContestAdminBoostySales({
  sales,
  loading,
}: ContestAdminBoostySalesProps) {
  if (!sales) {
    return (
      <section className="boosty-analytics-section" aria-labelledby="boosty-sales-title">
        <div className="boosty-analytics-section-head">
          <div>
            <h3 id="boosty-sales-title">Донаты и покупки постов Boosty</h3>
            <p>Точные операции с пользователями появятся после успешного импорта.</p>
          </div>
          <span className="is-partial">{loading ? 'Загрузка' : 'Источник недоступен'}</span>
        </div>
      </section>
    );
  }

  const transactions = sales.transactions.slice(0, 100);
  return (
    <section className="boosty-analytics-section" aria-labelledby="boosty-sales-title">
      <div className="boosty-analytics-section-head">
        <div>
          <h3 id="boosty-sales-title">Донаты и покупки постов Boosty</h3>
          <p>
            Точные строки creator sales API. Пользователи видны только администраторам.
          </p>
        </div>
        <span className={sales.coverage.complete ? 'is-complete' : 'is-partial'}>
          {sales.coverage.complete ? 'Импорт актуален' : 'Импорт устарел'}
        </span>
      </div>

      {sales.reconciliationMatches === false && (
        <output className="boosty-sales-quality-note">
          Ledger и агрегатные метрики Boosty расходятся. Ни одна операция не удалена
          автоматически: суммы ниже показывают строки sales API.
        </output>
      )}

      <div className="admin-stat-grid boosty-sales-stats">
        <div>
          <span>Донаты</span>
          <strong>{sales.summary.donations}</strong>
          <small>{formatRub(sales.summary.donationRevenueRub)}</small>
        </div>
        <div>
          <span>Покупки постов</span>
          <strong>{sales.summary.postPurchases}</strong>
          <small>{formatRub(sales.summary.postRevenueRub)}</small>
        </div>
        <div>
          <span>Покупатели</span>
          <strong>{sales.summary.uniqueBuyers}</strong>
          <small>уникальные Boosty ID</small>
        </div>
        <div>
          <span>Всего продаж</span>
          <strong>{formatRub(sales.summary.totalRevenueRub)}</strong>
          <small>сумма строк ledger</small>
        </div>
      </div>

      <div className="boosty-sales-split">
        <div>
          <h4>Платные посты</h4>
          <div className="boosty-sales-post-list">
            {sales.posts.length ? sales.posts.slice(0, 12).map(post => (
              <article key={post.postId}>
                <div>
                  <strong>{post.title}</strong>
                  <span>
                    {post.purchases} покупок · {post.uniqueBuyers} покупателей
                  </span>
                </div>
                <b>{formatRub(post.revenueRub)}</b>
              </article>
            )) : (
              <p className="contest-muted">Покупок постов за период нет.</p>
            )}
          </div>
        </div>

        <div>
          <h4>Покупатели и донатеры</h4>
          <div className="boosty-sales-table-wrap">
            <table className="boosty-sales-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Донаты</th>
                  <th>Посты</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {sales.buyers.slice(0, 100).map(buyer => (
                  <tr key={buyer.userId}>
                    <td>
                      <strong>{buyer.name || `Boosty #${buyer.userId}`}</strong>
                      <span>{buyer.email || 'email не указан'}</span>
                    </td>
                    <td>{buyer.donations}</td>
                    <td>{buyer.postPurchases}</td>
                    <td>{formatRub(buyer.totalRevenueRub)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sales.buyers.length && (
              <p className="contest-muted boosty-analytics-empty">
                Пользователей с операциями за период нет.
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4>Последние операции</h4>
        <div className="boosty-sales-table-wrap">
          <table className="boosty-sales-table boosty-sales-transactions">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Пользователь</th>
                <th>Пост</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(transaction => (
                <tr key={transaction.eventKey}>
                  <td>{formatAnalyticsDate(transaction.createdAt)}</td>
                  <td>
                    {transaction.type === 'donation' ? 'Донат' : 'Покупка поста'}
                  </td>
                  <td>
                    <strong>
                      {transaction.user.name || `Boosty #${transaction.user.id}`}
                    </strong>
                    <span>{transaction.user.email || 'email не указан'}</span>
                  </td>
                  <td>{transaction.post?.title || '—'}</td>
                  <td>{formatRub(transaction.amountRub)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!transactions.length && (
            <p className="contest-muted boosty-analytics-empty">
              Операций за выбранный период нет.
            </p>
          )}
        </div>
      </div>

      <footer className="boosty-analytics-footer">
        <span>Последний импорт: {formatAnalyticsDate(sales.coverage.latestImportAt)}</span>
        <span>Импортов: {sales.coverage.imports}</span>
        <span>
          В ledger: {sales.coverage.donationRows} донатов · {sales.coverage.postRows} покупок
        </span>
      </footer>
    </section>
  );
}
