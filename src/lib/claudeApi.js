// Ré-export fin — compatibilité ascendante.
//
// La logique a été déplacée dans la couche d'abstraction des fournisseurs
// (src/lib/providers/) et le module partagé de complexité (src/lib/complexity.js).
// Ce fichier reste pour ne pas casser d'éventuels imports historiques :
//   • `detectComplexity` — provider-agnostic, inchangé.
//   • `chatWithClaude`    — alias direct vers l'adaptateur Anthropic.
// Le code applicatif passe désormais par le registre `providers/index.js`
// (chat(provider, …)) pour respecter le fournisseur sélectionné.

export { detectComplexity } from './complexity';
export { chat as chatWithClaude } from './providers/anthropic';
