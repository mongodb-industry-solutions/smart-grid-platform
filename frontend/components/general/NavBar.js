"use client";

import Icon from "@leafygreen-ui/icon";
import { SideNav, SideNavItem } from "@leafygreen-ui/side-nav";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar({ collapsed, setCollapsed }) {
  const pathname = usePathname();

  return (
    <SideNav
      aria-label="Demo navigation"
      widthOverride={collapsed ? 56 : 240}
      baseFontSize={14}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      className="h-full"
      style={{ height: "100%" }}
    >
      <SideNavItem
        as={Link}
        href="/monitoring"
        active={pathname === "/monitoring"}
        glyph={<Icon glyph="MagnifyingGlass" />}
      >
        Monitoring Panel
      </SideNavItem>

      <SideNavItem
        as={Link}
        href="/customers"
        active={pathname === "/customers"}
        glyph={<Icon glyph="PersonGroup" />}
      >
        Customers
      </SideNavItem>

      <SideNavItem
        as={Link}
        href="/forecasting"
        active={pathname === "/forecasting"}
        glyph={<Icon glyph="Charts" />}
      >
        Forecasting
      </SideNavItem>

      <SideNavItem
        as={Link}
        href="/ai-chatbot"
        active={pathname === "/ai-chatbot"}
        glyph={<Icon glyph="Sparkle" />}
      >
        AI chatbot
      </SideNavItem>
    </SideNav>
  );
}
