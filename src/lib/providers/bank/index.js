// Registre des sources patrimoine et fusion en un instantané unique.
// Une source auto en échec ne doit jamais faire perdre les saisies manuelles.
import * as manualProvider from './manual';
import * as gocardlessProvider from './gocardless';

export { manualProvider as manual, gocardlessProvider as gocardless };

export async function getConsolidatedSnapshot(
  { config, storage = localStorage, includeAuto = true },
  deps = {},
) {
  const gocardless = deps.gocardless || gocardlessProvider;
  const positions = [...manualProvider.getPositions(storage)];
  const errors = [];

  const hasConfig = Boolean(config?.url && config?.secret);
  if (includeAuto && hasConfig) {
    try {
      const auto = await gocardless.getPositions(config);
      positions.push(...auto);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  return { generatedAt: new Date().toISOString(), positions, errors };
}
