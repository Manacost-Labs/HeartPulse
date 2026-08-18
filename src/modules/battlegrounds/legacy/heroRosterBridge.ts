import {
  resolveBattlegroundHeroRoster,
  type BattlegroundHeroRosterResolverInput,
} from '../model/heroRosterResolver';

const GLOBAL_BRIDGE_KEY = '__hsArenaBattlegroundHeroRosterBridgeV1';

type BridgeDependencies = {
  publicResourceUrl: (value: unknown) => string;
};
type InstalledResolverInput = Omit<BattlegroundHeroRosterResolverInput, 'publicResourceUrl'>;

let installedPort: Readonly<{
  version: 1;
  publicResourceUrl: BridgeDependencies['publicResourceUrl'];
  resolve: (input: InstalledResolverInput) => ReturnType<typeof resolveBattlegroundHeroRoster>;
}> | null = null;

function portFor(publicResourceUrl: BridgeDependencies['publicResourceUrl']) {
  if (installedPort?.publicResourceUrl === publicResourceUrl) return installedPort;
  installedPort = Object.freeze({
    version: 1 as const,
    publicResourceUrl,
    resolve(input: InstalledResolverInput) {
      return resolveBattlegroundHeroRoster({ ...input, publicResourceUrl });
    },
  });
  return installedPort;
}

function install(target: object, dependencies: BridgeDependencies): void {
  const port = portFor(dependencies.publicResourceUrl);
  if (!Reflect.set(target, GLOBAL_BRIDGE_KEY, port)) {
    throw new Error('Unable to install the Battlegrounds hero roster bridge');
  }
}

export const battlegroundHeroRosterBridgeV1 = Object.freeze({
  version: 1 as const,
  install,
});
