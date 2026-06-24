"use client";

import { useState } from "react";
import NavBar from "@/components/general/NavBar";

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);

  const effectiveCollapsed = collapsed && !hoverOpen;
  const expandedWidth = 240;
  const collapsedWidth = 56;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div
        className="h-full shrink-0"
        onMouseEnter={() => collapsed && setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
      >
        <NavBar
          collapsed={effectiveCollapsed}
          setCollapsed={setCollapsed}
        />
      </div>

      <main
        className="min-w-0 flex-1 overflow-auto p-8 transition-all duration-200"
        style={{
          marginLeft: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
