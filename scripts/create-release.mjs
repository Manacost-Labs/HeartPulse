import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const shaArg = process.argv.find(argument => argument.startsWith('--sha='));
const output = outputArg ? resolve(outputArg.slice('--output='.length)) : null;
const sha = (shaArg?.slice('--sha='.length) || process.env.RELEASE_SHA || '').trim().toLowerCase();
const nginxContractDefinitions = [
  { source: 'deploy/nginx/arena-html-routing.conf', installPath: '/etc/nginx/snippets/arena-html-routing.conf', roles: ['origin'] },
  { source: 'deploy/nginx/arena-seo-map.conf', installPath: '/etc/nginx/conf.d/31-arena-seo-map.conf', roles: ['origin'] },
  { source: 'deploy/nginx/arena-edge-region-map.conf', installPath: '/etc/nginx/conf.d/32-arena-edge-region-map.conf', roles: ['origin'] },
  { source: 'deploy/nginx/arena-card-local-maps.conf', installPath: '/etc/nginx/conf.d/31-arena-card-local-maps.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-edge-client-region-map.conf', installPath: '/etc/nginx/conf.d/33-arena-edge-client-region-map.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-edge-cache-path.conf', installPath: '/etc/nginx/conf.d/34-arena-edge-cache-path.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-edge-region-forward.conf', installPath: '/etc/nginx/snippets/arena-edge-region-forward.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-edge-static-cache.conf', installPath: '/etc/nginx/snippets/arena-edge-static-cache.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-cdn-card-image-cache.conf', installPath: '/etc/nginx/snippets/arena-cdn-card-image-cache.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-cdn-public-static.conf', installPath: '/etc/nginx/snippets/arena-cdn-public-static.conf', roles: ['edge'] },
  { source: 'deploy/nginx/arena-canonical-host-redirect.conf', installPath: '/etc/nginx/snippets/arena-canonical-host-redirect.conf', roles: ['origin'] },
  { source: 'deploy/nginx/arena-security-headers.conf', installPath: '/etc/nginx/snippets/arena-security-headers.conf', roles: ['origin'] },
];
const nginxContractFiles = nginxContractDefinitions.map(file => file.source);
const systemdFiles = [
  'deploy/systemd/hs-arena-card-image-sync.service',
  'deploy/systemd/hs-arena-card-image-sync.timer',
  'deploy/systemd/arena-geodns-monitor.service',
  'deploy/systemd/arena-geodns-monitor.timer',
];
const operationalFiles = [
  'deploy/activate-arena-static.sh',
  'deploy/arena-static-sync.sh',
  'deploy/activate-arena-card-images.sh',
  'deploy/arena-card-image-sync.sh',
  'deploy/monitor-arena-geodns.sh',
];

if (!output) throw new Error('Usage: node scripts/create-release.mjs --output=/path/to/release --sha=<git-sha>');
if (!/^[a-f0-9]{7,40}$/.test(sha)) throw new Error(`Invalid release SHA: ${sha || 'missing'}`);
if (existsSync(output)) throw new Error(`Release output already exists: ${output}`);

for (const required of [
  'build/server/index.js',
  'build/server/constructedCardImagePrewarmer.js',
  'dist/index.html',
  'dist/runtime-config.js',
  'dist/sitemap.xml',
  'dist/sitemaps/static.xml',
  'package.json',
  'package-lock.json',
  'scripts/verify-nginx-contract.mjs',
  ...nginxContractFiles,
  ...systemdFiles,
  ...operationalFiles,
]) {
  if (!existsSync(required)) throw new Error(`Required release input is missing: ${required}`);
}

mkdirSync(output, { recursive: false });
for (const directory of ['build', 'dist', 'public']) cpSync(directory, join(output, directory), { recursive: true });

const indexPath = join(output, 'dist', 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8');
const entryMatch = indexHtml.match(/<script\b[^>]*\bsrc="(\/assets\/[^"?]+\.js)"[^>]*><\/script>/);
if (!entryMatch) {
  throw new Error('Frontend entry script was not found in dist/index.html');
}
const entryAsset = join(output, 'dist', entryMatch[1].replace(/^\//, ''));
if (!existsSync(entryAsset) || !readFileSync(entryAsset, 'utf8').includes(sha)) {
  throw new Error('Frontend entry script does not contain the release SHA; rebuild with RELEASE_SHA or GITHUB_SHA');
}

mkdirSync(join(output, 'server'), { recursive: true });
cpSync('server/gen_legendary_image.py', join(output, 'server', 'gen_legendary_image.py'));
mkdirSync(join(output, 'scripts'), { recursive: true });
for (const script of [
  'backup-shared-data.sh',
  'verify-backup.sh',
  'restore-backup.sh',
  'replicate-backup.sh',
  'verify-nginx-contract.mjs',
]) {
  cpSync(join('scripts', script), join(output, 'scripts', script));
}
cpSync('package.json', join(output, 'package.json'));
cpSync('package-lock.json', join(output, 'package-lock.json'));
mkdirSync(join(output, 'deploy', 'nginx'), { recursive: true });
for (const file of nginxContractFiles) cpSync(file, join(output, file));
mkdirSync(join(output, 'deploy', 'systemd'), { recursive: true });
for (const file of systemdFiles) cpSync(file, join(output, file));
for (const file of operationalFiles) cpSync(file, join(output, file));

async function sha256(file) {
  const hash = createHash('sha256');
  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', rejectStream);
    stream.on('end', resolveStream);
  });
  return hash.digest('hex');
}

const criticalFiles = [
  'build/server/index.js',
  'build/server/constructedCardImagePrewarmer.js',
  'dist/index.html',
  'dist/sitemap.xml',
  'dist/sitemaps/static.xml',
  'package-lock.json',
  'scripts/backup-shared-data.sh',
  'scripts/verify-backup.sh',
  'scripts/restore-backup.sh',
  'scripts/replicate-backup.sh',
  'scripts/verify-nginx-contract.mjs',
  ...nginxContractFiles,
  ...systemdFiles,
  ...operationalFiles,
];
const checksums = Object.fromEntries(await Promise.all(
  criticalFiles.map(async file => [file, await sha256(join(output, file))]),
));
const packageLockHash = createHash('sha256')
  .update(readFileSync(join(output, 'package-lock.json')))
  .digest('hex');
const nginxContractEntries = nginxContractDefinitions.map(file => ({
  ...file,
  sha256: checksums[file.source],
}));
const nginxContractHash = createHash('sha256')
  .update(nginxContractEntries
    .map(file => `${file.source}\0${file.installPath}\0${file.roles.join(',')}\0${file.sha256}\n`)
    .join(''))
  .digest('hex');

const manifest = {
  schemaVersion: 2,
  sha,
  releaseName: sha,
  createdAt: new Date().toISOString(),
  node: process.version,
  packageLockHash,
  checksums,
  nginxContract: {
    schemaVersion: 1,
    hash: nginxContractHash,
    files: nginxContractEntries,
  },
};
writeFileSync(join(output, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`release artifact created: ${basename(output)} (${sha})`);
