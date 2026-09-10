import React from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import BottomTabs from './BottomTabs';
import BackButton from './BackButton';
import { Toaster } from '@/components/ui/sonner';

export default function AppLayout() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <>
      <div
        className="flex h-screen overflow-hidden bg-background app-shell"
        style={{
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="hidden lg:block shrink-0">
          <Sidebar open={false} onClose={() => {}} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <header
            className="lg:hidden flex items-center gap-2 px-4 border-b border-border bg-card shrink-0"
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              height: 'calc(3.5rem + env(safe-area-inset-top))',
            }}
          >
            <BackButton />
            <span className="text-base font-semibold text-foreground">InfoSignal</span>
          </header>
          <main className="flex-1 overflow-y-auto overscroll-none mobile-content-padding">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="min-h-full"
              >
                {outlet}
              </motion.div>
            </AnimatePresence>
          </main>
          <BottomTabs />
        </div>
      </div>
      <Toaster />
    </>
  );
}