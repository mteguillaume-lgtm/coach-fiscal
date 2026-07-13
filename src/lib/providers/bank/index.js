// Registre des sources patrimoine et fusion en un instantané unique.
// Une source auto en échec ne doit jamais faire perdre les saisies manuelles.
import * as manualProvider from './manual';
import * as enablebankingProvider from './enablebanking';

export { manualProvider as manual, enablebankingProvider as enablebanking };

export async function getConsolidatedSnapshot(
  { config, storage = localStorage, includeAuto = true },
  deps = {},
) {
  const enablebanking = deps.enablebanking || enablebankingProvider;
  const positions = [...manualProvider.getPositions(storage)];
  const errors = [];

  const hasConfig = Boolean(config?.url && config?.secret);
  if (includeAuto && hasConfig) {
    try {
      const auto = await enablebanking.getPositions(config);
      positions.push(...auto.positions);
      errors.push(...auto.errors);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  return { generatedAt: new Date().toISOString(), positions, errors };
}
