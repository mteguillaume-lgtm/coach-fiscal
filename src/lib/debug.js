// Logs de développement — silencieux en production.
// À utiliser pour tout log contenant du CONTENU (texte de document, question
// utilisateur, profil) : en prod ces données ne doivent jamais toucher la console.
const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export const debug     = DEV ? console.log.bind(console)  : () => {};
export const debugWarn = DEV ? console.warn.bind(console) : () => {};
