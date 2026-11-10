import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Clock, ShieldAlert, Sparkles, X } from 'lucide-react';
import { InAppNotification } from '../../shared/types.js';

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<InAppNotification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    refetchInterval: 15000 // Poll every 15 seconds for reactive demo alerts
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'include'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="relative inline-block">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface transition-all active:scale-95 cursor-pointer"
        title="Alerts & Delay Risk Notifications"
      >
        <Bell className="w-4 h-4 text-primary" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white font-mono font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 p-4 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600" />
                <h4 className="font-bold text-sm text-on-surface">
                  सूचनाएं (Alerts & Notifications)
                </h4>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-on-surface-variant">
                  <Check className="w-8 h-8 mx-auto text-success mb-1 opacity-70" />
                  <p className="font-bold">No notifications</p>
                  <p className="text-[11px]">All orders are on schedule. कोई संकट नहीं।</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) markReadMutation.mutate(n.id);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      n.is_read
                        ? 'bg-surface-container-low/60 border-outline-variant/20 opacity-75'
                        : n.severity === 'critical'
                        ? 'bg-red-50/70 border-red-200 text-red-950 shadow-xs'
                        : 'bg-amber-50/70 border-amber-200 text-amber-950 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        {n.severity === 'critical' ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        )}
                        <span className="line-clamp-1">{n.title}</span>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-red-600 shrink-0 mt-1" />
                      )}
                    </div>

                    <p className="text-[11px] text-stone-600 mt-1 leading-snug">
                      {n.message}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-stone-400 mt-2 font-mono">
                      <span>{n.order_number ? `Order #${n.order_number}` : 'System'}</span>
                      <span>
                        {new Date(n.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

