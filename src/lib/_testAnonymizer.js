// Outil de test DevTools — à importer uniquement en dev
// Usage : ouvrir DevTools > Console, puis :
//   const [file] = await new Promise(r => { const i = document.createElement('input'); i.type='file'; i.onchange=e=>r(e.target.files); i.click(); });
//   await testAnonymize(file);
//
// Ou plus rapide : glisser un PDF dans l'onglet Sources de DevTools
// puis : await testAnonymize(file) avec le File object récupéré

import { anonymizePdf, detectPeriod } from './anonymizer';
import { buildPatterns }               from './patterns';
import { extractWordsWithPositions }   from './pdfReader';

async function runTest(file, options = {}) {
  console.group(`🔍 Test anonymiseur — ${file.name}`);
  console.log('Fichier :', file.name, `(${(file.size / 1024).toFixed(1)} Ko)`);

  try {
    // 1. Extraction texte
    console.time('extraction');
    const pages = await extractWordsWithPositions(file);
    console.timeEnd('extraction');
    console.log(`Pages extraites : ${pages.length}`);

    // Afficher un aperçu du texte de la page 1
    const page1Text = pages[0]?.lines
      .slice(0, 8)
      .map(l => l.map(w => w.text).join(' '))
      .join('\n');
    console.log('Aperçu page 1 :\n', page1Text);

    // 2. Détection période
    const allText = pages.slice(0, 2)
      .flatMap(p => p.lines.map(l => l.map(w => w.text).join(' ')))
      .join('\n');
    const period = detectPeriod(allText);
    console.log('Période détectée :', period);
    console.log('Nom suggéré :', period.suggestedFilename);

    // 3. Patterns
    const { prenom = '', nom = '', employeur = '' } = options;
    const patterns = buildPatterns(prenom, nom, employeur);
    console.log(`Patterns actifs : ${patterns.filter(p => p.enabled).length} / ${patterns.length}`);

    // 4. Anonymisation complète
    console.time('anonymisation');
    const result = await anonymizePdf(file, {
      prenom, nom, employeur,
      logoEnabled: options.logoEnabled ?? true,
      padding: options.padding ?? 3,
    });
    console.timeEnd('anonymisation');

    console.log(`Zones noircies : ${result.zonesCount}`);
    console.log('Fichier suggéré :', result.suggestedFilename);

    // Détail des zones par page
    result.detections.forEach(({ page, zones }) => {
      if (zones.length > 0) {
        console.group(`Page ${page} — ${zones.length} zone(s)`);
        zones.forEach(z => console.log(`  [${z.label}] "${z.text}"`));
        console.groupEnd();
      }
    });

    // 5. Téléchargement automatique du PDF anonymisé
    const url = URL.createObjectURL(result.blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = result.suggestedFilename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    console.log('✅ PDF anonymisé téléchargé !');
    console.groupEnd();
    return result;

  } catch (err) {
    console.error('❌ Erreur :', err);
    console.groupEnd();
    throw err;
  }
}

// Enregistrement sur window uniquement en mode dev
if (import.meta.env.DEV) {
  /**
   * Teste l'anonymiseur depuis la console DevTools.
   * @param {File} file - Fichier PDF à anonymiser
   * @param {object} [options] - { prenom, nom, employeur, logoEnabled, padding }
   */
  window.testAnonymize = runTest;
  window.testPatterns  = buildPatterns;

  console.info(
    '[Coach Fiscal] Outils de test chargés :\n' +
    '  window.testAnonymize(file, { prenom, nom, employeur })\n' +
    '  window.testPatterns(prenom, nom, employeur)'
  );
}

export { runTest };
