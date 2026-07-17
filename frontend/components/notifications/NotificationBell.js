"use client";

import { useEffect } from "react";
import Icon from "@leafygreen-ui/icon";
import { useNotifications } from "./NotificationsContext";

const SEVERITY_COLOR = {
  high: "#DB3030",
  medium: "#D97706",
  low: "#00A35C",
};

function DetailLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="text-xs text-slate-500">
      {label}: <span className="font-medium text-slate-600">{value}</span>
    </div>
  );
}

function AlertDetails({ alert }) {
  return (
    <>
      <DetailLine label="Substation" value={alert.substation} />
      <DetailLine label="Feeder" value={alert.feeder} />
      <DetailLine label="Transformer" value={alert.transformer} />
      {alert.affected != null && (
        <div className="text-xs text-slate-500">
          {alert.affected} customer{alert.affected > 1 ? "s" : ""} affected
        </div>
      )}
    </>
  );
}

export default function NotificationBell() {
  const {
    alerts,
    unread,
    isOpen,
    focusId,
    toast,
    openCenter,
    closeCenter,
    toggleCenter,
    dismissToast,
  } = useNotifications();

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(dismissToast, 6000);
    return () => clearTimeout(id);
  }, [toast, dismissToast]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleCenter}
        aria-label="Notifications"
        title="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <Icon glyph="Bell" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {/* Notification center */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCenter} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">
                Notifications
              </span>
              <button
                type="button"
                onClick={closeCenter}
                aria-label="Close"
                className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon glyph="X" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  No alerts yet.
                </div>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`flex gap-3 border-b border-slate-50 px-4 py-3 ${
                      a.id === focusId ? "bg-red-50" : ""
                    }`}
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.high }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {a.title}
                      </div>
                      <AlertDetails alert={a} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Toast for the newest alert */}
      {toast && (
        <button
          type="button"
          onClick={() => openCenter(toast.id)}
          className="fixed right-6 top-20 z-[60] flex w-80 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-xl hover:bg-slate-50"
        >
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: SEVERITY_COLOR[toast.severity] || SEVERITY_COLOR.high }}
          >
            <Icon glyph="Warning" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">
              {toast.title}
            </span>
            <AlertDetails alert={toast} />
            <span className="mt-1 block text-[11px] font-medium text-emerald-700">
              View in notifications →
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
