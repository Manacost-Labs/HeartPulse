import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';

// Styles: LoginPanel.css arrives lazily with the card, so the frame geometry
// lives in LoginCardSkeleton.css. A view that renders this skeleton imports
// that file and LoadingSurface.css next to it, as with LoadingSurface itself:
// the identity public entry that re-exports it stays CSS-free for Node.

/**
 * A line-shaped fill for static copy of the card: the copy is generated
 * content in transparent ink, so the fill wraps exactly like the text it
 * stands for, while the DOM and accessibility tree carry no text.
 */
function TextBlock({ text }: { text: string }) {
  return <span className="loading-block login-card-skeleton__text" data-text={text} />;
}

function FieldBlock({ label }: { label: string }) {
  return <span className="login-card-skeleton__field">
    <span><TextBlock text={label} /></span>
    <LoadingBlock className="login-card-skeleton__input" />
  </span>;
}

/**
 * The loading state of the signed-out sign-in card (`LoginCard`, login mode):
 * the same page frame, card, emblem, title, mode switch, two fields, submit,
 * hint, footer link and legal note, so the card replaces it without a shift.
 * It also stands in while a remembered session is checked; the signed-in
 * dashboard has its own layout and simply replaces it.
 */
export function LoginCardSkeleton({ label = 'Загружаем вход' }: { label?: string }) {
  return <div className="login-card-skeleton">
    <LoadingSurface label={label} quiet layout="rows" className="login-card-skeleton__card"
      blocksClassName="login-card-skeleton__stack">
      <span className="login-card-skeleton__header">
        <LoadingBlock className="login-card-skeleton__emblem" />
        <span className="login-card-skeleton__title"><TextBlock text="Вход в HearthPulse" /></span>
        <span className="login-card-skeleton__intro">
          <TextBlock text="Один аккаунт для статистики, статей и конкурсов Манакоста." />
        </span>
      </span>
      <LoadingBlock className="login-card-skeleton__tabs" />
      <span className="login-card-skeleton__form">
        <FieldBlock label="Почта" />
        <FieldBlock label="Пароль" />
        <LoadingBlock className="login-card-skeleton__submit" />
        <span className="login-card-skeleton__hint"><TextBlock text="Пришлём на почту код из 6 цифр." /></span>
      </span>
      <span className="login-card-skeleton__link"><TextBlock text="Забыли пароль?" /></span>
      <span className="login-card-skeleton__legal">
        {/* The two links of the note are bold, so they wrap as bold copy. */}
        <span className="loading-block login-card-skeleton__text">
          <span data-text="Продолжая, вы принимаете " /><b data-text="условия использования" />
          <span data-text=" и " /><b data-text="политику конфиденциальности" /><span data-text="." />
        </span>
      </span>
    </LoadingSurface>
  </div>;
}
