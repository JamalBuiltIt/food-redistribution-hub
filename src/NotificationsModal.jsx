// NotificationsModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, MessageSquare, Package, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function NotificationsModal({ currentUser, isChefTheme, onClose, onOpenChat }) {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- AUDIO & COUNT TRACKING REFS ---
  const prevUnreadCountRef = useRef(0);
  const isInitialMount = useRef(true);
  const audioRef = useRef(
    typeof Audio !== 'undefined' ? new Audio('/sounds/pop-alert.mp3') : null
  );

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

  // --- NOTIFICATION SOUND LOGIC ---
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    // 1. Skip playing the sound on the very first load to avoid blasting the user
    if (isInitialMount.current && !isLoading) {
      isInitialMount.current = false;
      prevUnreadCountRef.current = unreadCount;
      return;
    }

    // 2. Play sound if data is loaded and the unread count went UP
    if (!isLoading && unreadCount > prevUnreadCountRef.current) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0; // Reset sound to start
        audioRef.current.play().catch((err) => {
          console.warn("Browser blocked audio autoplay. User interaction required:", err);
        });
      }
    }

    // 3. Update the reference for the next cycle
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount, isLoading]);

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

    const titleMatch = notif.title?.match(/@([a-zA-Z0-9_-]+)/);
    const bodyMatch = notif.body?.match(/@([a-zA-Z0-9_-]+)/);
    const senderUsername = 
      notif.sender_username || 
      notif.donor || 
      (titleMatch ? titleMatch[1] : null) || 
      (bodyMatch ? bodyMatch[1] : null);

    const isMessage = 
      notif.type === 'DIRECT_MESSAGE' || 
      notif.type === 'NEW_MESSAGE' || 
      notif.type === 'ITEM_MESSAGE' || 
      (notif.order_id && notif.order_id.startsWith('dm_'));

    if (isMessage) {
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
        
        {/* HEADER - Theme Dynamic */}
        <div className={`p-5 text-white flex justify-between items-center shrink-0 ${isChefTheme ? 'bg-amber-950' : 'bg-slate-900'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl shadow-md text-white ${isChefTheme ? 'bg-amber-600' : 'bg-emerald-600'}`}>
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Notifications & Messages</h3>
              <p className="text-xs text-slate-400 font-medium">Stay updated on your activity</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllAsRead}
              title="Mark all as read"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <CheckCheck className={`w-4 h-4 ${isChefTheme ? 'text-amber-400' : 'text-emerald-400'}`} /> Mark Read
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
                    : isChefTheme 
                    ? 'bg-amber-50/50 border-amber-200 shadow-sm hover:shadow' 
                    : 'bg-emerald-50/50 border-emerald-200 shadow-sm hover:shadow'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                    notif.type === 'DIRECT_MESSAGE' || notif.type === 'NEW_MESSAGE' || notif.type === 'ITEM_MESSAGE'
                      ? isChefTheme ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
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
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isChefTheme ? 'bg-amber-600' : 'bg-emerald-600'}`}></span>
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