import { SectionBanner } from '../../shared/ui/EditorialRouteChrome';
import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
import '../../shared/ui/LoadingSurface.css';
import './applicationConnectFrame.css';
import './ApplicationConnectSkeleton.css';

/**
 * A line-shaped fill for static copy of the view: the copy is generated
 * content in transparent ink, so the fill wraps exactly like the text it
 * stands for, while the DOM and accessibility tree carry no text.
 */
function TextBlock({ text }: { text: string }) {
  return <span className="loading-block application-connect-skeleton__text" data-text={text} />;
}

const STEPS = ['Код устройства', 'Проверка доступа', 'Готово'];

/**
 * The loading state of `ApplicationConnectView` in its first (code entry)
 * state: the same banner, header, step strip and code section from the real
 * classes, with placeholders for the copy and controls. The page title stays
 * real; the one status sits outside any busy region.
 */
export function ApplicationConnectSkeleton() {
  return <div className="application-connect application-connect--loading">
    <SectionBanner title="Подключить Manacost Tracker" />
    <LoadingSurface label="Загружаем подключение" quiet layout="rows" className="application-connect-skeleton"
      blocksClassName="application-connect-skeleton__parts">
      <div className="application-connect__header">
        <div className="application-connect__brand">
          <span className="application-connect__brand-mark">
            <img src="/arena-logo-icon-256.webp" alt="" width="88" height="88" />
          </span>
          <div>
            <span className="application-connect__kicker">
              <LoadingBlock className="application-connect-skeleton__icon" />
              <TextBlock text="Безопасный вход Manacost" />
            </span>
            <p>
              <TextBlock text={'Подтвердите вход на этом устройстве. Приложение получит отдельный токен, '
                + 'а ваш пароль останется только на Manacost.'} />
            </p>
          </div>
        </div>
        <ul className="application-connect__trust">
          <li><LoadingBlock className="application-connect-skeleton__icon" /><TextBlock text="Пароль не передаётся" /></li>
          <li><LoadingBlock className="application-connect-skeleton__icon" /><TextBlock text="Доступ можно отозвать" /></li>
        </ul>
      </div>

      <div className="application-connect__steps">
        <ol>
          {STEPS.map((step, index) => <li key={step} className={index === 0 ? 'is-current' : undefined}>
            <span data-text={String(index + 1)} />
            <strong><TextBlock text={step} /></strong>
          </li>)}
        </ol>
      </div>

      <div className="application-connect__body">
        <div className="application-connect__code">
          <div className="application-connect__section-heading">
            <span />
            <div>
              <p><TextBlock text="Код подтверждения" /></p>
              <span className="application-connect-skeleton__heading"><TextBlock text="Введите код из приложения" /></span>
              <small><TextBlock text="Сверьте восемь символов с кодом, показанным в Manacost Tracker." /></small>
            </div>
          </div>
          <div className="application-connect-skeleton__form">
            <span className="application-connect-skeleton__label"><TextBlock text="Код устройства" /></span>
            <span className="application-connect-skeleton__row">
              <LoadingBlock className="application-connect-skeleton__input" />
              <span className="loading-block application-connect-skeleton__button" data-text="Проверить код" />
            </span>
            <small><TextBlock text="Формат: четыре буквы, дефис и четыре символа" /></small>
          </div>
        </div>
      </div>
    </LoadingSurface>
  </div>;
}
