import { motion } from 'framer-motion';

export default function AuroraBackground({
  showGrid = true,
  showBeam = false,
  intensity = 1,
  className = '',
}) {
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity: intensity }}
    >
      {/* Orb principal */}
      <motion.div
        className="absolute -top-1/4 -left-1/4 w-[700px] h-[700px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(46,184,138,0.22) 0%, rgba(46,184,138,0) 60%)',
          filter: isTouch ? 'blur(30px)' : 'blur(40px)',
          willChange: 'transform',
        }}
        animate={isTouch ? {} : {
          x: [0, 40, -20, 0],
          y: [0, -30, 15, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Orb secondaire — desktop uniquement */}
      {!isTouch && (
        <motion.div
          className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(29,158,117,0.15) 0%, rgba(29,158,117,0) 60%)',
            filter: 'blur(50px)',
            willChange: 'transform',
          }}
          animate={{
            x: [0, -30, 20, 0],
            y: [0, 20, -15, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
      )}

      {/* Grille de points */}
      {showGrid && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, #000 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 50%, #000 30%, transparent 80%)',
          }}
        />
      )}

      {/* Beam lumineux */}
      {showBeam && (
        <motion.div
          className="absolute inset-y-0 w-32 -skew-x-12"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(46,184,138,0.07), transparent)' }}
          animate={{ x: ['-20%', '120%'] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', repeatDelay: 5 }}
        />
      )}

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 100% 70% at 50% 50%, transparent 40%, rgba(10,10,11,0.6) 100%)' }}
      />
    </div>
  );
}
