import React, { type ReactNode } from 'react';
import { LoadingSurface } from '../../shared/ui/LoadingSurface';
import '../../shared/ui/LoadingSurface.css';
import type { AdminCrmSegmentId } from '../../modules/adminCrm/public';
import type { AdminMessage, AdminWorkspaceSection } from '../adminWorkspaceState';
import { isAdminSection } from './adminNavigation';
import { SECTION_CHUNKS } from './sectionPreload';
import { ContestsSection } from './sections/ContestsSection';
import { BoostySection, ReferralsSection, TelegramSection } from './sections/IntegrationSections';
import { MailingSection } from './sections/MailingSection';
import { UsersSection, type UsersSegmentRequest } from './sections/UsersSection';

const AdminOverviewPage = React.lazy(SECTION_CHUNKS.dashboard);
const ContestAdminArticles = React.lazy(async () => ({ default: (await SECTION_CHUNKS.articles()).ContestAdminArticles }));
const ContestAdminGallery = React.lazy(async () => ({ default: (await SECTION_CHUNKS.gallery()).ContestAdminGallery }));
const ContestAdminTranslations = React.lazy(async () => ({ default: (await SECTION_CHUNKS.translations()).ContestAdminTranslations }));
const ContestAdminMechanicTranslations = React.lazy(async () => ({ default: (await SECTION_CHUNKS.mechanics()).ContestAdminMechanicTranslations }));
const ContestAdminStandardOperations = React.lazy(async () => ({ default: (await SECTION_CHUNKS.operations()).ContestAdminStandardOperations }));
const ContestAdminFunDecks = React.lazy(async () => ({ default: (await SECTION_CHUNKS.operations()).ContestAdminFunDecks }));
const AdminApiKeys = React.lazy(async () => ({ default: (await SECTION_CHUNKS.apiKeys()).AdminApiKeys }));

/** The shared loading panel, holding the height of the admin section that replaces it. */
function SectionFallback({ minHeight = 520 }: { minHeight?: number }) {
  return <div style={{ width: '100%', ['--loading-surface-min-block' as string]: `${minHeight}px` }}>
    <LoadingSurface label="Загружаем раздел" />
  </div>;
}

function Lazy({ children, minHeight }: { children: ReactNode; minHeight?: number }) {
  return <React.Suspense fallback={<SectionFallback minHeight={minHeight} />}>{children}</React.Suspense>;
}

export type AdminSectionContext = {
  currentUserId?: string;
  adminEmail: string;
  usersSegmentRequest: UsersSegmentRequest | null;
  onMessage: (message: AdminMessage | null) => void;
  onCopy: (text: string, okText?: string) => Promise<void>;
  onNavigate: (section: AdminWorkspaceSection) => void;
  onOpenSegment: (segment: AdminCrmSegmentId) => void;
};

/** The content of one admin section; access to the section was checked by the panel. */
export function renderAdminSection(section: AdminWorkspaceSection, context: AdminSectionContext): ReactNode {
  const { onMessage } = context;
  switch (section) {
    case 'dashboard':
      return <Lazy minHeight={420}>
        <AdminOverviewPage
          onNavigate={next => { if (isAdminSection(next)) context.onNavigate(next); }}
          onOpenSegment={context.onOpenSegment}
        />
      </Lazy>;
    case 'users':
      return <UsersSection currentUserId={context.currentUserId} segmentRequest={context.usersSegmentRequest} onMessage={onMessage} />;
    case 'mailing':
      return <MailingSection adminEmail={context.adminEmail} onMessage={onMessage} />;
    case 'boosty':
      return <BoostySection />;
    case 'telegram':
      return <TelegramSection />;
    case 'contests':
      return <ContestsSection onMessage={onMessage} onCopy={context.onCopy} />;
    case 'referrals':
      return <ReferralsSection onMessage={onMessage} onCopy={context.onCopy} />;
    case 'articles':
      return <Lazy><ContestAdminArticles onMessage={onMessage} /></Lazy>;
    case 'gallery':
      return <Lazy><ContestAdminGallery onMessage={onMessage} /></Lazy>;
    case 'translations':
      return <Lazy><ContestAdminTranslations onMessage={onMessage} /></Lazy>;
    case 'mechanics':
      return <Lazy><ContestAdminMechanicTranslations onMessage={onMessage} /></Lazy>;
    case 'standard-data':
      return <Lazy><ContestAdminStandardOperations onMessage={onMessage} /></Lazy>;
    case 'fun-decks':
      return <Lazy><ContestAdminFunDecks /></Lazy>;
    case 'api-keys':
      return <Lazy minHeight={440}><AdminApiKeys /></Lazy>;
    default:
      return null;
  }
}
