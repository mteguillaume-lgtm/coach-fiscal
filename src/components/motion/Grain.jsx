import { useEffect, useRef } from 'react';

/**
 * Grain noise overlay — texture subtile pour effet premium dark.
 * Utilise une feTurbulence SVG inline encodée en data URL, donc 0 fetch HTTP.
 * Pattern Apple / Linear / Vercel.
 *
 * À placer en sibling dans une page sombre, juste après le background principal.
 *
 * @param {number}  opacity      Opacité du grain (0-1, défaut 0.025)
 * @param {string}  blendMode    mix-blend-mode CSS (défaut 'overlay')
 * @param {number}  zIndex       z-index (défaut 1 — au-dessus de l'aurora, sous le contenu)
 * @param {boolean} fixed        true = fixed viewport, false = absolute parent (défaut true)
 */
export default function Grain({
  opacity = 0.025,
  blendMode = 'overlay',
  zIndex = 1,
  fixed = true,
}) {
  const ref = useRef(null);

  // Désactivé sur mobile/touch — évalué après le mount (évite faux positif React 19 + Babel)
  useEffect(() => {
    if (!ref.current) return;
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) ref.current.style.display = 'none';
  }, []);

  const positionClass = fixed ? 'fixed inset-0' : 'absolute inset-0';

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none ${positionClass}`}
      style={{
        opacity,
        zIndex,
        mixBlendMode: blendMode,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        backgroundSize: '200px 200px',
      }}
    />
  );
}
