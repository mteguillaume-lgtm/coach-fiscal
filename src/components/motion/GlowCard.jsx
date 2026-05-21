import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Card qui affiche un glow radial qui suit la position du curseur.
 * Effet premium pour les sections "features" ou cards stats.
 *
 * @param {ReactNode} children    Contenu de la card
 * @param {string}    className   Classes CSS additionnelles
 * @param {string}    glowColor   Couleur du glow — défaut Kapio
 * @param {number}    glowSize    Taille du glow (px) — défaut 400
 * @param {boolean}   liftOnHover Ajouter un translateY au hover — défaut true
 */
export default function GlowCard({
  children,
  className = '',
  glowColor = 'rgba(46, 184, 138, 0.15)',
  glowSize = 400,
  liftOnHover = true,
  ...rest
}) {
  const ref = useRef(null);
  const [mouse, setMouse] = useState({ x: -1000, y: -1000 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => { setIsHovering(false); setMouse({ x: -1000, y: -1000 }); }}
      whileHover={liftOnHover ? { y: -4 } : undefined}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden card-dark ${className}`}
      {...rest}
    >
      {/* Glow qui suit le curseur */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: isHovering ? 1 : 0,
          background: `radial-gradient(${glowSize}px circle at ${mouse.x}px ${mouse.y}px, ${glowColor}, transparent 70%)`,
        }}
      />

      {/* Bordure conique animée au hover (subtile) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-500"
        style={{
          opacity: isHovering ? 1 : 0,
          background: `radial-gradient(${glowSize * 1.5}px circle at ${mouse.x}px ${mouse.y}px, rgba(46,184,138,0.4), transparent 40%)`,
          mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '1px',
        }}
      />

      {/* Contenu */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}