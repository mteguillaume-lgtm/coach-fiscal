import { motion } from 'framer-motion';

/**
 * Background décoratif "aurora" — mesh gradient animé subtil.
 * À utiliser en absolute fill derrière un hero ou une section premium.
 *
 * @param {boolean} showGrid     Afficher la grille de points en surimpression
 * @param {boolean} showBeam     Afficher un beam lumineux qui traverse
 * @param {number}  intensity    Intensité globale (0-1) — défaut 1
 * @param {string}  className    Classes additionnelles
 */
export default function AuroraBackground({
  showGrid = true,
  showBeam = false,
  intensity = 1,
  className = '',
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity: intensity }}
    >
      {/* Aurora orbs */}
      <motion.div
        className="absolute -top-1/4 -left-1/4 w-[800px] h-[800px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(46,184,138,0.25) 0%, rgba(46,184,138,0) 60%)',
          filter: 'blur(60px)',
        }}
        animate={{
          x: [0, 50, -30, 0],
          y: [0, -40, 20, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute top-1/3 right-0 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(29,158,117,0.2) 0%, rgba(29,158,117,0) 60%)',
          filter: 'blur(80px)',
        }}
        animate={{
          x: [0, -40, 30, 0],
          y: [0, 30, -20, 0],
          scale: [1, 0.9, 1.05, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0) 60%)',
          filter: 'blur(70px)',
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -25, 15, 0],
          scale: [1, 1.05, 0.95, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 3,
        }}
      />

      {/* Grille de points en overlay */}
      {showGrid && (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, #000 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, #000 30%, transparent 80%)',
          }}
        />
      )}

      {/* Beam lumineux qui traverse */}
      {showBeam && (
        <motion.div
          className="absolute inset-y-0 w-32 -skew-x-12"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(46,184,138,0.08), transparent)',
          }}
          animate={{ x: ['-20%', '120%'] }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
            repeatDelay: 4,
          }}
        />
      )}

      {/* Vignette pour ancrer le contenu */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 100% 70% at 50% 50%, transparent 40%, rgba(10,10,11,0.6) 100%)',
        }}
      />
    </div>
  );
}