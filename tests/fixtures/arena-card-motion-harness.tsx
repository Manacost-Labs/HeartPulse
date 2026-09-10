import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './arena-card-motion.css';
import { HSCard, Winrates } from '../../src/features/DeferredRoutes';

const portraitSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23315576"/%3E%3C/svg%3E';
const wideSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="960" height="320"%3E%3Crect width="960" height="320" fill="%23644c82"/%3E%3C/svg%3E';
const card = (name: string, imageRu?: string) => ({ cardId: '', name, rarity: 'rare', cost: 4, imageRu, score: 75, classKey: 'mage' });
function Harness() {
  return <main>
    <div className="arena-motion-tailwind-probe p-3">Tailwind utility-layer probe</div>
    <div className="arena-app-tierlist" style={{ maxWidth: 760, padding: 24 }}><div className="tierlist-card-grid"><HSCard card={card('Портретный источник', portraitSource)} onClick={() => undefined} /><HSCard card={card('Широкий источник', wideSource)} onClick={() => undefined} /><HSCard card={card('Fallback без изображения')} onClick={() => undefined} /></div></div><div className="arena-app-winrates" style={{ maxWidth: 760, padding: 24 }}><Winrates classes={[{ id: 'mage', name: 'Маг', winrate: 54.2, color: '#4c78d0', games: 12890 }, { id: 'warrior', name: 'Воин', winrate: 49.1, color: '#c44d44', games: 11200, textDark: true }]} loading={false} switching={false} error={false} updatedAt="2026-09-10T12:00:00.000Z" winrateSource="hsreplay" onSourceChange={() => undefined} onNavigate={() => undefined} authUser={null} subscriptionStatus={null} subscriptionLoading onRefreshSubscription={async () => null} /></div>
  </main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Arena card-motion fixture root is missing');
createRoot(root).render(<StrictMode><Harness /></StrictMode>);
