"use client";

import Link from "next/link";
import InfoWizard from "@/components/infoWizard/InfoWizard";
import NotificationBell from "@/components/notifications/NotificationBell";

export default function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-6 px-6 py-4">
        <Link
          href="/"
          aria-label="Smart Meter home"
          className="inline-flex items-start gap-3 no-underline"
        >
          <img
            src="/mongodb-leaf.svg"
            alt="MongoDB leaf"
            className="h-16 w-10 shrink-0"
          />

          <div className="leading-none">
            <div className="font-serif text-[25px] leading-[0.9] text-slate-900">
              Smart Grid
            </div>
            <div className="mt-1 text-[15px] leading-none text-slate-900">
              Management Platform
            </div>
            <div className="mt-2 text-[12px] leading-none">
              <span className="text-slate-900">by </span>
              <span className="text-emerald-700">MongoDB</span>
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <InfoWizard />
        </div>
      </div>
    </header>
  );
}
