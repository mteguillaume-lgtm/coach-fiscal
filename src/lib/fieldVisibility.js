// Visibilité conditionnelle d'un champ de formulaire (descripteur f.dependsOn).
// Partagé entre FieldRow (rendu) et Collect (comptage/validation des champs affichés).

export function fieldVisible(f, formData) {
  if (!f.dependsOn) return true;
  const depVal = formData?.[f.dependsOn.key];
  return f.dependsOn.check ? f.dependsOn.check(depVal) : depVal === f.dependsOn.value;
}
