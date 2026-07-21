import React from 'react';
import type { AdminMessage } from './adminWorkspaceState';
import { ParserControlPanel } from './adminParserControl/ParserControlPanel';
import { StandardOperationsLegacy } from './adminParserControl/StandardOperationsLegacy';

export function ContestAdminStandardOperations({ onMessage }: { onMessage: (message: AdminMessage | null) => void }) {
  return (
    <div className="admin-standard-operations">
      <ParserControlPanel onMessage={onMessage} />
      <StandardOperationsLegacy onMessage={onMessage} />
    </div>
  );
}
