// NotificationsModal.jsx
import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCheck, MessageSquare, Package, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function NotificationsModal({ currentUser, onClose, onOpenChat, appMode = 'surplus' }) {
  const isChefTheme = appMode === 'chef';
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

    if (
      notif.type === 'DIRECT_MESSAGE' ||
      notif.type === 'NEW_MESSAGE' ||
      notif.type === 'ITEM_MESSAGE'
    ) {
      const match = notif.title.match(/@(.+)$/);
      const senderUsername = match ? match[1] : null;

      if (senderUsername) {
        onOpenChat({
          id: notif.order_id || `dm_${[currentUser.username, senderUsername].sort().join('_')}`,
          title: notif.type === 'ITEM_MESSAGE' ? notif.title : `Direct Message with @${senderUsername}`,
          donor: senderUsername,
          isDirectDm: notif.type !== 'ITEM_MESSAGE',
        });
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
        {/* HEADER */}
        <div className={`p-5 border-b border-slate-100 flex justify-between items-center ${isChefTheme ? 'bg-amber-50/50' : 'bg-emerald-50/50'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isChefTheme ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-base ${isChefTheme ? 'text-amber-900' : 'text-emerald-900'}`}>Notifications</h3>
              <p className="text-xs text-slate-500">Stay updated on your listings & chats</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllAsRead}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors ${
                isChefTheme 
                  ? 'text-amber-700 hover:bg-amber-100' 
                  : 'text-emerald-700 hover:bg-emerald-100'
              }`}
              title="Mark all as read"
            >
              <CheckCheck className="w-4 h-4 inline mr-1" /> Read All
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS LIST */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-12 flex justify-center items-center">
              <Loader2 className={`w-6 h-6 animate-spin ${isChefTheme ? 'text-amber-600' : 'text-emerald-600'}`} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">No notifications yet</p>
              <p className="text-xs text-slate-400">We'll notify you when something happens!</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  notif.is_read
                    ? 'bg-white border-slate-100 hover:border-slate-200'
                    : isChefTheme 
                      ? 'bg-amber-50/60 border-amber-200/80 shadow-sm' 
                      : 'bg-emerald-50/60 border-emerald-200/80 shadow-sm'
                }`}
              >
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    notif.type === 'DIRECT_MESSAGE' || notif.type === 'NEW_MESSAGE' || notif.type === 'ITEM_MESSAGE'
                      ? isChefTheme ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
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