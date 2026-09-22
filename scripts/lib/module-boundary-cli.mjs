import { singleLineDisplay } from './diagnostic-text-policy.mjs';

const DEFAULT_CONFIG_PATH = 'config/module-boundaries.json';

export function parseModuleBoundaryCliArguments(args, cwd = process.cwd()) {
  const parsed = { error: null, rootDir: cwd, configPath: DEFAULT_CONFIG_PATH };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== '--root' && argument !== '--config') {
      return { error: `Unknown argument: ${singleLineDisplay(argument)}` };
    }
    const value = args[index + 1];
    if (typeof value !== 'string' || value.trim().length === 0 || value.startsWith('--')) {
      return { error: `Missing value for argument: ${argument}` };
    }
    parsed[argument === '--root' ? 'rootDir' : 'configPath'] = value;
    index += 1;
  }
  return parsed;
}
