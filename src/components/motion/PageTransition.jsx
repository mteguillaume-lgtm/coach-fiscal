import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * Wrapper de transition entre routes.
 * À placer autour de <Outlet /> dans le Layout.
 *
 * @param {ReactNode} children  Le contenu de la page (généralement <Outlet />)
 */
export default function PageTransition({ children }) {
  const { pathname } = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{
          duration: 0.35,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}