"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const NotificationsContext = createContext(null);

/**
 * Shared alert/notification state for the whole app: the map (or any component)
 * pushes alerts, and the header bell renders + focuses them.
 */
export function NotificationsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);

  const addAlert = useCallback((alert, { silent = false } = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, time: new Date(), severity: "high", ...alert };
    setAlerts((prev) => [entry, ...prev]);
    if (!silent) {
      setUnread((u) => u + 1);
      setToast(entry);
    }
    return id;
  }, []);

  const openCenter = useCallback((id = null) => {
    setIsOpen(true);
    setFocusId(id);
    setUnread(0);
    setToast(null);
  }, []);

  const closeCenter = useCallback(() => {
    setIsOpen(false);
    setFocusId(null);
  }, []);

  const toggleCenter = useCallback(() => {
    setIsOpen((open) => {
      if (!open) setUnread(0);
      return !open;
    });
    setToast(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Clears everything — used to (re)start the demo from a clean slate.
  const reset = useCallback(() => {
    setAlerts([]);
    setUnread(0);
    setToast(null);
    setIsOpen(false);
    setFocusId(null);
  }, []);

  const value = useMemo(
    () => ({
      alerts,
      unread,
      isOpen,
      focusId,
      toast,
      addAlert,
      openCenter,
      closeCenter,
      toggleCenter,
      dismissToast,
      reset,
    }),
    [alerts, unread, isOpen, focusId, toast, addAlert, openCenter, closeCenter, toggleCenter, dismissToast, reset]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
