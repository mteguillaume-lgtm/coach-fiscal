import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

/**
 * Bouton qui suit légèrement le curseur quand il s'en approche.
 * Effet "magnétique" subtil — typique des sites premium (Linear, Vercel).
 *
 * @param {ReactNode} children   Contenu du bouton
 * @param {number}    strength   Force de l'effet magnétique (0-1) — défaut 0.3
 * @param {string}    className  Classes CSS
 * @param {function}  onClick    Handler de clic
 * @param {string}    as         Tag — défaut 'button'
 */
export default function MagneticButton({
  children,
  strength = 0.3,
  className = '',
  onClick,
  as = 'button',
  ...rest
}) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, { stiffness: 200, damping: 20, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 200, damping: 20, mass: 0.5 });

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distanceX = (e.clientX - centerX) * strength;
    const distanceY = (e.clientY - centerY) * strength;
    x.set(distanceX);
    y.set(distanceY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const MotionTag = motion[as] || motion.button;

  return (
    <MotionTag
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{ x: springX, y: springY }}
      className={className}
      {...rest}
    >
      <motion.span
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
      >
        {children}
      </motion.span>
    </MotionTag>
  );
}
