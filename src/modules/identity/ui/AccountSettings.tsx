import type { FormEvent } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import AccountSectionHead from './AccountSectionHead';

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

/** The newsletter switch and the contacts used only to hand over prizes. */
export default function AccountSettings({ values, countries, saving, onChange, onSubmit }: AccountSettingsProps) {
  return (
    <section id="account-settings" className="account-section account-settings" aria-labelledby="account-settings-title" data-tour-id="profile-contacts">
      <AccountSectionHead
        id="account-settings-title"
        icon={<SlidersHorizontal size={15} aria-hidden="true" />}
        eyebrow="Настройки"
        title="Рассылка и контакты"
        description="Новости на почту и как связаться с вами, если выиграете приз."
      />
      <form className="account-settings__form account-rows" onSubmit={onSubmit}>
        <fieldset className="account-row account-settings__newsletter">
          <legend className="account-row__label">Рассылка</legend>
          <div className="account-row__body">
            <label className="account-settings__check">
              <input type="checkbox" checked={values.newsletter} onChange={event => onChange({ newsletter: event.target.checked })} />
              Присылать новости Манакоста на почту
            </label>
            <a className="account-settings__faq" href="/faq/#faq-newsletter">Как управлять рассылкой</a>
          </div>
        </fieldset>
        <fieldset className="account-row account-settings__contacts">
          <legend className="account-row__label">Контакты для призов</legend>
          <div className="account-row__body">
            <p className="account-row__hint">Только чтобы передать приз победителю. Вход и подписку эти поля не меняют.</p>
            <div className="account-settings__grid">
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
                <input id="account-vk" value={values.vkUrl} onChange={event => onChange({ vkUrl: event.target.value })} placeholder="vk.com/username" />
              </div>
              <div className="account-settings__field">
                <label htmlFor="account-contact-email">Почта для связи</label>
                <input id="account-contact-email" type="email" value={values.contactEmail} onChange={event => onChange({ contactEmail: event.target.value })} placeholder="mail@example.com" />
              </div>
            </div>
          </div>
        </fieldset>
        <div className="account-row account-settings__actions">
          <div className="account-row__body">
            <button type="submit" className="account-button" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </div>
      </form>
    </section>
  );
}
