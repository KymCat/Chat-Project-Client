import type { MouseEventHandler, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface TerminalModalTransitionProps {
  visible: boolean;
  className: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function TerminalModalTransition({
  visible,
  className,
  children,
  onClick,
}: TerminalModalTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          className={className}
          role="presentation"
          onClick={onClick}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.14 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
