// NotificationsModal.jsx
import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCheck, MessageSquare, Package, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function NotificationsModal({ currentUser, onClose, onOpenChat }) {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!currentUser?.username) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.username)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, [currentUser?.username]);

  const handleMarkAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUser.username)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notif.id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
    }

    onClose();

    // 1. Robustly extract sender username from title, body, or explicit properties
    const titleMatch = notif.title?.match(/@([a-zA-Z0-9_-]+)/);
    const bodyMatch = notif.body?.match(/@([a-zA-Z0-9_-]+)/);
    const senderUsername = 
      notif.sender_username || 
      notif.donor || 
      (titleMatch ? titleMatch[1] : null) || 
      (bodyMatch ? bodyMatch[1] : null);

    // 2. Check if the notification is a direct message or chat-related
    const isMessage = 
      notif.type === 'DIRECT_MESSAGE' || 
      notif.type === 'NEW_MESSAGE' || 
      notif.type === 'ITEM_MESSAGE' || 
      (notif.order_id && notif.order_id.startsWith('dm_'));

    if (isMessage) {
      // Use notif.order_id if it's already a valid chat room ID, otherwise construct the deterministic participant chat ID
      const chatId = (notif.order_id && notif.order_id.startsWith('dm_'))
        ? notif.order_id
        : senderUsername
        ? `dm_${[currentUser.username, senderUsername].sort().join('_')}`
        : notif.order_id;

      onOpenChat({
        id: chatId,
        title: senderUsername ? `Direct Message with @${senderUsername}` : notif.title || 'Direct Message',
        donor: senderUsername,
        isDirectDm: true,
      });
    } else if (notif.order_id) {
      // Surplus item or order related notification
      const { data: itemData } = await supabase
        .from('surplus_items')
        .select('*')
        .eq('id', notif.order_id)
        .maybeSingle();

      onOpenChat(
        itemData || {
          id: notif.order_id,
          title: notif.title?.replace(/💬 Message about "/, '').replace(/"/, '') || 'Item Chat',
          isDirectDm: false,
        }
      );
    } else {
      // Fallback generic notification click
      onOpenChat({
        id: notif.id,
        title: notif.title || 'Chat',
        isDirectDm: false,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl flex flex-col h-[600px] border border-slate-100 overflow-hidden animate-fade-in">
        
        {/* HEADER */}
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-md">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Notifications & Messages</h3>
              <p className="text-xs text-slate-400 font-medium">Stay updated on your surplus rescue activity</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllAsRead}
              title="Mark all as read"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <CheckCheck className="w-4 h-4 text-emerald-400" /> Mark Read
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS LIST */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-400 gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-2">
              <Bell className="w-10 h-10 opacity-30" />
              <p className="font-medium">No notifications yet. You're all caught up!</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-3.5 items-start ${
                  notif.is_read
                    ? 'bg-white border-slate-200 opacity-80 hover:opacity-100'
                    : 'bg-emerald-50/50 border-emerald-200 shadow-sm hover:shadow'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                    notif.type === 'DIRECT_MESSAGE' || notif.type === 'NEW_MESSAGE' || notif.type === 'ITEM_MESSAGE'
                      ? 'bg-emerald-600 text-white'
                      : notif.type === 'ITEM_CLAIMED'
                      ? 'bg-amber-500 text-amber-950'
                      : 'bg-slate-800 text-white'
                  }`}
                >
                  {notif.type === 'DIRECT_MESSAGE' || notif.type === 'NEW_MESSAGE' || notif.type === 'ITEM_MESSAGE' ? (
                    <MessageSquare className="w-4 h-4" />
                  ) : notif.type === 'ITEM_CLAIMED' ? (
                    <Package className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-bold text-slate-900 text-xs tracking-tight">{notif.title}</h4>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">{notif.body}</p>
                  <span className="text-[10px] text-slate-400 mt-2 block font-medium">
                    {new Date(notif.created_at || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    • {new Date(notif.created_at || Date.now()).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}