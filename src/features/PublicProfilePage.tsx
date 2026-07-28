import { useEffect, useState } from 'react';
import { CalendarDays, Copy, ShieldCheck, UserCircle } from 'lucide-react';
import { applyDocumentPageMeta } from '../seo/publicUrlPolicy';
import { publicProfilePath } from '../profileRoutes';
import './PublicProfilePage.css';

export type PublicProfile = {
  publicProfileId: string;
  name: string;
  avatarInitials: string;
  createdAt: string;
};

type PublicProfileCardProps = {
  profile: PublicProfile;
  onCopyLink: () => Promise<void> | void;
};

function memberSince(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    : 'дата не указана';
}

export function PublicProfileCard({
  profile,
  onCopyLink,
}: PublicProfileCardProps) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    await onCopyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <section className="public-profile-card" aria-labelledby="public-profile-title">
      <div className="public-profile-card__crest" aria-hidden="true">
        {profile.avatarInitials || profile.name.slice(0, 2).toUpperCase()}
      </div>
      <p className="public-profile-card__eyebrow">
        <ShieldCheck size={16} aria-hidden="true" />
        Публичный профиль
      </p>
      <h1 id="public-profile-title">{profile.name}</h1>
      <p className="public-profile-card__member-since">
        <CalendarDays size={17} aria-hidden="true" />
        На Manacost с {memberSince(profile.createdAt)}
      </p>
      <dl className="public-profile-card__identity">
        <div>
          <dt><UserCircle size={17} aria-hidden="true" /> ID профиля</dt>
          <dd><code>{profile.publicProfileId}</code></dd>
        </div>
      </dl>
      <div className="public-profile-card__actions">
        <button type="button" onClick={() => { void copyLink(); }}>
          <Copy size={17} aria-hidden="true" />
          {copied ? 'Ссылка скопирована' : 'Скопировать публичную ссылку'}
        </button>
        <a href="/">На главную</a>
      </div>
      <p className="public-profile-card__privacy">
        Контакты, подписка и данные входа видны только владельцу профиля.
      </p>
    </section>
  );
}

export default function PublicProfilePage({ publicProfileId }: { publicProfileId: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(publicProfileId)}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.profile) {
          throw new Error(payload.error || 'Профиль не найден');
        }
        setProfile(payload.profile as PublicProfile);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setProfile(null);
          setError(loadError instanceof Error ? loadError.message : 'Профиль не найден');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [publicProfileId]);

  useEffect(() => {
    if (!profile) return;
    void applyDocumentPageMeta({
      title: `${profile.name} — профиль | Manacost Stats`,
      description: `Публичный профиль участника ${profile.name} на Manacost Stats.`,
      pathname: publicProfilePath(profile.publicProfileId),
      search: '',
    });
  }, [profile]);

  if (loading) {
    return <section className="public-profile-state" aria-busy="true"><strong>Загружаем профиль…</strong></section>;
  }
  if (error || !profile) {
    return (
      <section className="public-profile-state" role="alert">
        <strong>Профиль не найден</strong>
        <span>{error || 'Проверьте адрес публичного профиля.'}</span>
        <a href="/">Вернуться на главную</a>
      </section>
    );
  }

  return (
    <div className="public-profile-page">
      <PublicProfileCard
        profile={profile}
        onCopyLink={() => navigator.clipboard.writeText(window.location.href)}
      />
    </div>
  );
}
