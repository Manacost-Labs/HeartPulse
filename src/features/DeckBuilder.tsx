/**
 * Temporary stub: DeckBuilder module is referenced by App.tsx but the feature
 * source was removed from the workspace. Keep the route importable so arena
 * production builds (legendaries and the rest) can ship.
 */
import React from 'react';

export default function DeckBuilder(_props: {
  isAdmin?: boolean;
  authChecking?: boolean;
}) {
  return (
    <div className="p-6 text-center text-[#6b4c2a]">
      <h1 className="font-hs text-2xl mb-2">Конструктор колод</h1>
      <p className="text-sm">Раздел временно недоступен.</p>
    </div>
  );
}
