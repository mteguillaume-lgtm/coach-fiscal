import { motion } from 'framer-motion';

/**
 * Wrapper qui révèle son contenu quand il entre dans le viewport.
 * Supporte délais (stagger), directions et présence/absence.
 *
 * @param {ReactNode}  children     Contenu à révéler
 * @param {number}     delay        Délai avant animation (s) — défaut 0
 * @param {number}     duration     Durée de l'animation (s) — défaut 0.6
 * @param {string}     direction    'up' | 'down' | 'left' | 'right' | 'none'
 * @param {number}     distance     Distance de translation (px) — défaut 30
 * @param {boolean}    once         N'animer qu'une fois — défaut true
 * @param {string}     className    Classes CSS additionnelles
 * @param {string}     as           Tag HTML — défaut 'div'
 */
export default function ScrollReveal({
  children,
  delay = 0,
  duration = 0.6,
  direction = 'up',
  distance = 30,
  once = true,
  className = '',
  as = 'div',
  ...rest
}) {
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const directions = {
    up:    { y: distance,  x: 0 },
    down:  { y: -distance, x: 0 },
    left:  { x: distance,  y: 0 },
    right: { x: -distance, y: 0 },
    none:  { x: 0,         y: 0 },
  };

  // On mobile: opacity-only fade (no translation = no GPU compositing layer per element)
  const initial = isTouch ? { opacity: 0 } : { opacity: 0, ...directions[direction] };
  const animate = isTouch ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };

  const MotionTag = motion[as] || motion.div;

  return (
    <MotionTag
      initial={initial}
      whileInView={animate}
      viewport={{ once, margin: '-10% 0px' }}
      transition={{
        duration: isTouch ? 0.4 : duration,
        delay: isTouch ? delay * 0.5 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Wrapper pour orchestrer plusieurs ScrollReveal en cascade (stagger).
 * Les enfants ScrollReveal n'ont plus besoin de gérer eux-mêmes leur delay.
 */
export function ScrollRevealGroup({
  children,
  stagger = 0.08,
  className = '',
}) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <ScrollReveal key={i} delay={i * stagger}>
              {child}
            </ScrollReveal>
          ))
        : <ScrollReveal>{children}</ScrollReveal>}
    </div>
  );
}