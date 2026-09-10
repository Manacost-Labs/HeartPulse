import '../../src/index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BattlegroundHeroesRoute } from '../../src/features/Battlegrounds';

function HeroMotionHarness() {
  const [path, setPath] = useState(new URLSearchParams(location.search).get('path') || '/heroes/61488');
  return (
    <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}>
      <BattlegroundHeroesRoute path={path} onNavigate={setPath} />
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Hero motion fixture root is missing');
createRoot(root).render(<HeroMotionHarness />);
