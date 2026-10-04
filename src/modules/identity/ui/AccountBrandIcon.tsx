import { Mail } from 'lucide-react';

export type AccountBrand = 'email' | 'telegram' | 'boosty' | 'patreon';

const LOGOS: Record<Exclude<AccountBrand, 'email'>, string> = {
  telegram: '/auth-icons/telegram.svg',
  boosty: '/ad/boosty-96.webp',
  patreon: '/auth-icons/patreon.svg',
};

/** A provider's logo beside its name; decorative, the name carries the meaning. */
export default function AccountBrandIcon({ brand }: { brand: AccountBrand }) {
  if (brand === 'email') return <span className="account-brand account-brand--mail" aria-hidden="true"><Mail size={18} /></span>;
  return <img className="account-brand account-brand--logo" src={LOGOS[brand]} alt="" width={34} height={34} loading="lazy" decoding="async" />;
}
