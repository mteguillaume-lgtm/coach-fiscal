import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

export default function GlowCard({
  children,
  className = '',
  glowColor = 'rgba(46, 184, 138, 0.15)',
  glowSize = 400,
  liftOnHover = true,
  ...rest
}) {
  const ref = useRef(null);
  const glowRef = useRef(null);
  const borderRef = useRef(null);
  const rafRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      if (!ref.current) { rafRef.current = null; return; }
      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(${glowSize}px circle at ${x}px ${y}px, ${glowColor}, transparent 70%)`;
      }
      if (borderRef.current) {
        borderRef.current.style.background = `radial-gradient(${glowSize * 1.5}px circle at ${x}px ${y}px, rgba(46,184,138,0.4), transparent 40%)`;
      }
      rafRef.current = null;
    });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={liftOnHover ? { y: -4 } : undefined}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden card-dark ${className}`}
      {...rest}
    >
      {/* Glow qui suit le curseur */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ opacity: isHovering ? 1 : 0 }}
      />

      {/* Bordure conique animée au hover */}
      <div
        ref={borderRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-500"
        style={{
          opacity: isHovering ? 1 : 0,
          mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '1px',
        }}
      />

      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}
