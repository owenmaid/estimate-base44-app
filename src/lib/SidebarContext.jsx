import React, { createContext, useContext, useState, useCallback } from 'react';

const SidebarContext = createContext({ hidden: false, setHidden: () => {} });

export function SidebarProvider({ children }) {
  const [hidden, setHiddenState] = useState(false);
  const setHidden = useCallback((v) => setHiddenState(v), []);
  return (
    <SidebarContext.Provider value={{ hidden, setHidden }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}