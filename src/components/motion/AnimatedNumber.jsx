import { useEffect, useRef } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';

/**
 * Compteur animé qui démarre quand l'élément entre dans le viewport.
 *
 * @param {number}  value         Valeur cible
 * @param {number}  duration      Durée de l'animation (ms) — défaut 1500
 * @param {string}  prefix        Préfixe (ex: "€")
 * @param {string}  suffix        Suffixe (ex: "€" ou " %")
 * @param {number}  decimals      Nombre de décimales — défaut 0
 * @param {boolean} formatFR      Format français (espace milliers) — défaut true
 * @param {string}  className     Classes CSS additionnelles
 */
export default function AnimatedNumber({
  value = 0,
  duration = 1500,
  prefix = '',
  suffix = '',
  decimals = 0,
  formatFR = true,
  className = '',
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });

  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    duration,
    bounce: 0,
    damping: 30,
    stiffness: 100,
  });

  const display = useTransform(spring, (latest) => {
    const fixed = Number(latest).toFixed(decimals);
    if (!formatFR) return `${prefix}${fixed}${suffix}`;
    // Format français : 245 800
    const [intPart, decPart] = fixed.split('.');
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
    return `${prefix}${decPart ? `${formatted},${decPart}` : formatted}${suffix}`;
  });

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}