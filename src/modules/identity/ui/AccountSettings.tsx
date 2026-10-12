import type { FormEvent } from 'react';

export type AccountSettingsValues = {
  country: string;
  telegram: string;
  vkUrl: string;
  contactEmail: string;
  newsletter: boolean;
};

export type AccountSettingsProps = {
  values: AccountSettingsValues;
  countries: readonly string[];
  saving: boolean;
  onChange: (patch: Partial<AccountSettingsValues>) => void;
  onSubmit: (event: FormEvent) => void;
};

/** Contacts used only to hand over prizes, plus the newsletter switch; folded by default. */
export default function AccountSettings({ values, countries, saving, onChange, onSubmit }: AccountSettingsProps) {
  return (
    <details id="account-settings" className="account-card account-settings" data-tour-id="profile-contacts">
      <summary>Контакты и рассылка</summary>
      <form className="account-settings__form" onSubmit={onSubmit}>
        <fieldset className="account-settings__contacts">
          <legend>Контакты для призов</legend>
          <p className="account-muted">Оставьте удобный способ связи, чтобы мы могли передать приз. Эти поля не привязывают аккаунты и не подтверждают подписку.</p>
          <div className="account-settings__field">
            <label htmlFor="account-country">Страна</label>
            <select id="account-country" value={values.country} onChange={event => onChange({ country: event.target.value })}>
              <option value="">Не указана</option>
              {countries.map(country => <option key={country} value={country}>{country}</option>)}
            </select>
          </div>
          <div className="account-settings__field">
            <label htmlFor="account-telegram">Telegram для связи</label>
            <input id="account-telegram" value={values.telegram} onChange={event => onChange({ telegram: event.target.value })} placeholder="@username" />
          </div>
          <div className="account-settings__field">
            <label htmlFor="account-vk">VK</label>
            <input id="account-vk" value={values.vkUrl} onChange={event => onChange({ vkUrl: event.target.value })} placeholder="https://vk.com/username" />
          </div>
          <div className="account-settings__field">
            <label htmlFor="account-contact-email">Почта для связи</label>
            <input id="account-contact-email" type="email" value={values.contactEmail} onChange={event => onChange({ contactEmail: event.target.value })} placeholder="mail@example.com" />
          </div>
        </fieldset>
        <fieldset className="account-settings__newsletter">
          <legend>Рассылка</legend>
          <label className="account-settings__check">
            <input type="checkbox" checked={values.newsletter} onChange={event => onChange({ newsletter: event.target.checked })} />
            Присылать новости Манакоста на почту
          </label>
          <p className="account-muted">Выбор применяется после сохранения. <a href="/faq/#faq-newsletter">Как управлять рассылкой</a></p>
        </fieldset>
        <button type="submit" className="account-button" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
      </form>
    </details>
  );
}
