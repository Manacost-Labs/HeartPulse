import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const shaArg = process.argv.find(argument => argument.startsWith('--sha='));
const output = outputArg ? resolve(outputArg.slice('--output='.length)) : null;
const sha = (shaArg?.slice('--sha='.length) || process.env.RELEASE_SHA || '').trim().toLowerCase();

if (!output) throw new Error('Usage: node scripts/create-release.mjs --output=/path/to/release --sha=<git-sha>');
if (!/^[a-f0-9]{7,40}$/.test(sha)) throw new Error(`Invalid release SHA: ${sha || 'missing'}`);
if (existsSync(output)) throw new Error(`Release output already exists: ${output}`);

for (const required of ['build/server/index.js', 'dist/index.html', 'package.json', 'package-lock.json']) {
  if (!existsSync(required)) throw new Error(`Required release input is missing: ${required}`);
}

mkdirSync(output, { recursive: false });
for (const directory of ['build', 'dist', 'public']) cpSync(directory, join(output, directory), { recursive: true });
mkdirSync(join(output, 'server'), { recursive: true });
cpSync('server/gen_legendary_image.py', join(output, 'server', 'gen_legendary_image.py'));
cpSync('package.json', join(output, 'package.json'));
cpSync('package-lock.json', join(output, 'package-lock.json'));

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

const criticalFiles = ['build/server/index.js', 'dist/index.html', 'package-lock.json'];
const checksums = Object.fromEntries(await Promise.all(
  criticalFiles.map(async file => [file, await sha256(join(output, file))]),
));
const packageLockHash = createHash('sha256')
  .update(readFileSync(join(output, 'package-lock.json')))
  .digest('hex');

const manifest = {
  schemaVersion: 1,
  sha,
  releaseName: sha,
  createdAt: new Date().toISOString(),
  node: process.version,
  packageLockHash,
  checksums,
};
writeFileSync(join(output, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`release artifact created: ${basename(output)} (${sha})`);
