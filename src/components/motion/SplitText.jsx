import { motion } from 'framer-motion';

/**
 * Texte qui apparaît lettre par lettre avec blur-in.
 * Pattern Apple / Linear hero.
 *
 * Préserve le wrap mot-à-mot (les caractères d'un même mot ne sont jamais
 * coupés sur deux lignes).
 *
 * @param {string}  text       Le texte à animer (string brute)
 * @param {boolean} gradient   Applique la classe .text-gradient sur chaque caractère
 * @param {number}  delay      Delay initial avant la 1ère lettre (s, défaut 0)
 * @param {number}  stagger    Décalage entre lettres (s, défaut 0.035)
 * @param {number}  duration   Durée de l'animation de chaque lettre (s, défaut 0.7)
 * @param {string}  className  Classes additionnelles sur le wrapper
 */
export default function SplitText({
  text,
  gradient = false,
  delay = 0,
  stagger = 0.035,
  duration = 0.7,
  className = '',
}) {
  if (typeof text !== 'string' || !text.length) {
    return <span className={className}>{text}</span>;
  }

  const words = text.split(' ');
  let charIndex = 0;

  return (
    <span className={className} aria-label={text}>
      {words.map((word, wi) => {
        const chars = Array.from(word);
        return (
          <span
            key={`w-${wi}`}
            className="inline-block whitespace-nowrap"
            aria-hidden="true"
          >
            {chars.map((c, ci) => {
              const i = charIndex++;
              return (
                <motion.span
                  key={`c-${ci}`}
                  initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{
                    duration,
                    delay: delay + i * stagger,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={'inline-block' + (gradient ? ' text-gradient' : '')}
                >
                  {c}
                </motion.span>
              );
            })}
            {wi < words.length - 1 ? (
              <span className="inline-block">{'\u00A0'}</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
