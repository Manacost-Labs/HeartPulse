import { mockProfileRequests } from './profile-workspace-data';

const params = new URLSearchParams(location.search);
mockProfileRequests(params.get('access') !== 'none', params.has('failRefresh'));
history.replaceState(null, '', '/standard/meta/?login');
void import('../../src/main');
