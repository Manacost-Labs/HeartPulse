import assert from 'node:assert/strict';
import { isForbiddenRemoteAddress, normalizedIp } from '../server/remoteAddressPolicy.js';

const forbidden = [
  '0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '192.0.0.8', '192.0.2.10',
  '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '255.255.255.255',
  '::', '::1', '::ffff:7f00:1', '::ffff:127.0.0.1', '::7f00:1', '::ffff:0:a00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::1',
  '2002:7f00:1::', '2001:0:4136:e378::1', '2001:db8::1', '2001:10::1', '2001:20::1', '2001:2::1', '100::1',
  'fc00::1', 'fd12::1', 'fe80::1%eth0', 'fec0::1', 'ff02::1', '[::1]', 'FE80::1',
];
const allowed = [
  '8.8.8.8', '93.184.216.34', '192.0.77.2', '172.32.0.1', '2606:4700:4700::1111', '2001:4860::8888',
  '::ffff:5db8:d822', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1',
];
for (const address of forbidden) assert.equal(isForbiddenRemoteAddress(address), true, `${address} must be refused`);
for (const address of allowed) assert.equal(isForbiddenRemoteAddress(address), false, `${address} is public`);
assert.equal(isForbiddenRemoteAddress('images.example.test'), false, 'host names are resolved first, not classified');
assert.equal(normalizedIp(' [FE80::1] '), 'fe80::1');

console.log('remote address policy tests passed');
