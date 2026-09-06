import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileRoute = readFileSync(
  new URL('../src/features/DeferredRoutes.tsx', import.meta.url),
  'utf8',
);
const dashboardOverview = readFileSync(
  new URL('../src/components/ProfileDashboardOverview.tsx', import.meta.url),
  'utf8',
);
const profileStyles = readFileSync(
  new URL('../src/features/DeferredRoutes.css', import.meta.url),
  'utf8',
);
assert.match(profileRoute, /ProfileDashboardOverview/);
assert.match(dashboardOverview, /profile-dashboard-overview/);
assert.match(dashboardOverview, /Сводка профиля/);
assert.match(profileRoute, /profile-subscription-source--active/);
assert.match(profileRoute, /profile-account-actions__logout/);
assert.match(profileStyles, /\.profile-dashboard-overview\s*\{/);
assert.match(profileStyles, /\.profile-dashboard-overview__item\s*\{/);
assert.match(profileStyles, /\.profile-subscription-source--active/);
assert.match(profileStyles, /\.profile-subscription-sources\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(profileStyles, /\.profile-account-actions__logout\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
assert.match(profileStyles, /@media \(max-width: 640px\)[\s\S]*profile-dashboard-overview/);
assert.match(profileStyles, /\.profile-public-link\s+a\s*\{/);
assert.match(profileStyles, /\.profile-public-link\s+button\s*\{/);

console.log('profile dashboard UI contract passed');
