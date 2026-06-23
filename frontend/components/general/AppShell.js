"use client";

import { useState } from "react";
import NavBar from "@/components/general/NavBar";

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  const expandedWidth = 240;
  const collapsedWidth = 56; // ajusta este valor si lo quieres más ancho

  return (
    <div className="min-h-screen">
      <div className="fixed top-0 left-0 h-screen z-50">
        <NavBar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      <main
        className="transition-all duration-200 p-8"
        style={{
          marginLeft: collapsed ? collapsedWidth : expandedWidth,
        }}
      >
        {children}
      </main>
    </div>
  );
}
