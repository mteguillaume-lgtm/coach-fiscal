import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Spotlight curseur — un halo teal qui suit la souris.
 * Pattern Vercel docs / Linear.
 *
 * À placer en sibling au début d'une section/page premium.
 * Se base sur la position du pointeur dans le viewport (fixed).
 *
 * @param {number} size       Diamètre du halo en px (défaut 500)
 * @param {string} color      Couleur RGB du halo (défaut kapio teal)
 * @param {number} intensity  Opacité max (0-1, défaut 0.18)
 * @param {number} zIndex     z-index (défaut 0 — sous le contenu z-10)
 */
export default function SpotlightCursor({
  size = 500,
  color = '46, 184, 138',
  intensity = 0.18,
  zIndex = 0,
}) {
  const [pos, setPos] = useState({ x: -2000, y: -2000 });
  const [visible, setVisible] = useState(false);

  // Pas de curseur sur touch — inutile et GPU-intensif
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  useEffect(() => {
    if (isTouch) return;
    const move = (e) => {
      setPos({ x: e.clientX, y: e.clientY });
      if (!visible) setVisible(true);
    };
    const leave = () => setVisible(false);
    const enter = () => setVisible(true);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerleave', leave);
    window.addEventListener('pointerenter', enter);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerenter', enter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTouch]);

  if (isTouch) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        zIndex,
        background: `radial-gradient(${size}px circle at ${pos.x}px ${pos.y}px, rgba(${color}, ${intensity}), transparent 65%)`,
      }}
    />
  );
}
