'use client';

import { motion } from 'framer-motion';

type PageEnterProps = React.ComponentProps<typeof motion.div>;

export function PageEnter({ children, className, ...props }: PageEnterProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
