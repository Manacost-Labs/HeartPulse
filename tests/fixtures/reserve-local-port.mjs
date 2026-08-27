import { createServer } from 'node:net';

export function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Could not reserve a browser-test port'));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}
