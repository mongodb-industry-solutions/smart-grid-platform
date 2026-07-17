"use client";

import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";
import { NotificationsProvider } from "@/components/notifications/NotificationsContext";

export function Providers({ children }) {
  return (
    <LeafyGreenProvider>
      <NotificationsProvider>{children}</NotificationsProvider>
    </LeafyGreenProvider>
  );
}
