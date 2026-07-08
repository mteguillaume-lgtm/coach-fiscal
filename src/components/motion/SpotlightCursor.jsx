import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export default function SpotlightCursor({
  size = 500,
  color = '46, 184, 138',
  intensity = 0.18,
  zIndex = 0,
}) {
  const ref        = useRef(null);
  const rafRef     = useRef(null);
  const posRef     = useRef({ x: -2000, y: -2000 });
  const movedRef   = useRef(false);           // true after first pointermove
  const [visible, setVisible] = useState(false);
  const reduced    = useReducedMotion();       // préférence système (audit E6)

  useEffect(() => {
    const move = (e) => {
      posRef.current = { x: e.clientX, y: e.clientY };

      // Premier mouvement → rendre visible (cas où la souris était déjà dans
      // la fenêtre au chargement de la page, pointerenter ne s'étant pas déclenché)
      if (!movedRef.current) {
        movedRef.current = true;
        setVisible(true);
      }

      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        if (ref.current) {
          const { x, y } = posRef.current;
          ref.current.style.background = `radial-gradient(${size}px circle at ${x}px ${y}px, rgba(${color}, ${intensity}), transparent 65%)`;
        }
        rafRef.current = null;
      });
    };

    const leave = () => { movedRef.current = false; setVisible(false); };
    const enter = () => setVisible(true);

    window.addEventListener('pointermove',  move,  { passive: true });
    window.addEventListener('pointerleave', leave);
    window.addEventListener('pointerenter', enter);

    return () => {
      window.removeEventListener('pointermove',  move);
      window.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerenter', enter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [size, color, intensity]);

  // Décoratif pur : rien à rendre si l'utilisateur préfère réduire les animations.
  if (reduced) return null;

  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ zIndex }}
    />
  );
}
