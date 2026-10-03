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
        <p className="account-muted">Нужны, только если вы выиграете конкурс: так мы передадим приз.</p>
        <label htmlFor="account-country">Страна</label>
        <select id="account-country" value={values.country} onChange={event => onChange({ country: event.target.value })}>
          <option value="">Не указана</option>
          {countries.map(country => <option key={country} value={country}>{country}</option>)}
        </select>
        <label htmlFor="account-telegram">Telegram для связи</label>
        <input id="account-telegram" value={values.telegram} onChange={event => onChange({ telegram: event.target.value })} placeholder="@username" />
        <label htmlFor="account-vk">VK</label>
        <input id="account-vk" value={values.vkUrl} onChange={event => onChange({ vkUrl: event.target.value })} placeholder="https://vk.com/username" />
        <label htmlFor="account-contact-email">Почта для связи</label>
        <input id="account-contact-email" type="email" value={values.contactEmail} onChange={event => onChange({ contactEmail: event.target.value })} placeholder="mail@example.com" />
        <label className="account-settings__check">
          <input type="checkbox" checked={values.newsletter} onChange={event => onChange({ newsletter: event.target.checked })} />
          Присылать новости Манакоста на почту
        </label>
        <button type="submit" className="account-button" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
      </form>
    </details>
  );
}
