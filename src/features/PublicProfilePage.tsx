import { useEffect, useState } from 'react';
import { CalendarDays, Copy, Home } from 'lucide-react';
import ProfileIdentityHero from '../components/ProfileIdentityHero';
import { applyDocumentPageMeta } from '../seo/publicUrlPolicy';
import { publicProfilePath } from '../profileRoutes';
import './PublicProfilePage.css';

export type PublicProfile = {
  publicProfileId: string;
  name: string;
  avatarInitials: string;
  createdAt: string;
};

async function fetchPublicProfile(publicProfileId: string, signal: AbortSignal) {
  const response = await fetch(`/api/profiles/${encodeURIComponent(publicProfileId)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.profile) {
    throw new Error(payload.error || 'Профиль не найден');
  }
  return payload.profile as PublicProfile;
}

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
    <div className="profile-workspace public-profile-card-shell">
      <div className="profile-card">
        <ProfileIdentityHero
          eyebrow="Публичный профиль"
          name={profile.name}
          publicProfileId={profile.publicProfileId}
          avatarInitials={profile.avatarInitials}
          headingId="public-profile-title"
          actions={(
            <div className="profile-public-link">
              <button type="button" onClick={() => { void copyLink(); }}>
                <Copy size={14} aria-hidden="true" />
                {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              <a href="/">
                <Home size={14} aria-hidden="true" />
                На главную
              </a>
            </div>
          )}
          badges={[
            {
              label: `На Manacost с ${memberSince(profile.createdAt)}`,
              icon: <CalendarDays size={14} aria-hidden="true" />,
            },
          ]}
        />
      </div>
    </div>
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
        setProfile(await fetchPublicProfile(publicProfileId, controller.signal));
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
        onCopyLink={() => navigator.clipboard.writeText(
          new URL(publicProfilePath(profile.publicProfileId), window.location.origin).href,
        )}
      />
    </div>
  );
}
