'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

/** Fades and lifts a block into place when it scrolls into view. Skips the movement for people who ask for less motion. */
export function Reveal({ children, delay = 0, className, ...rest }: { children: ReactNode; delay?: number; className?: string } & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }} {...rest}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : 'hidden'} whileInView="show" viewport={{ once: true, margin: '-40px' }} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
      {children}
    </motion.div>
  );
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}>
      {children}
    </motion.div>
  );
}
