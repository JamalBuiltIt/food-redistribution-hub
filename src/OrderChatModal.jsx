// OrderChatModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function OrderChatModal({ order, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendError, setSendError] = useState('');
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!order?.id) return;

    const orderIdStr = String(order.id);

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderIdStr)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else if (data) {
        // Prevent aggressive re-rendering if messages are the same
        setMessages((prev) => (prev.length !== data.length ? data : prev));
      }
      setIsLoading(false);
    };

    // 1. Initial fetch
    fetchMessages().then(scrollToBottom);

    // 2. FAILSAFE POLLING ENGINE (Triggers every 3 seconds)
    // Guarantee messages arrive even if Realtime WebSockets are blocked by firewall
    const pollingInterval = setInterval(() => {
      fetchMessages();
    }, 3000);

    // 3. Supabase Realtime Listener (Instant Updates)
    const channel = supabase
      .channel(`chat_order_${orderIdStr.replace(/[^a-zA-Z0-9]/g, '')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (String(payload.new.order_id) === orderIdStr) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              const newChat = [...prev, payload.new];
              // Small delay to ensure render happens before scrolling
              setTimeout(scrollToBottom, 50);
              return newChat;
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollingInterval); // Clean up the failsafe loop
      supabase.removeChannel(channel); // Clean up the websocket
    };
  }, [order?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser) return;

    const textToSend = newMessage.trim();
    setNewMessage('');
    setSendError('');

    const msgPayload = {
      order_id: String(order.id),
      sender_id: String(currentUser.id),
      sender_username: currentUser.username,
      content: textToSend,
    };

    // Insert to DB
    const { data, error } = await supabase.from('messages').insert([msgPayload]).select();

    if (error) {
      console.error('Failed to send message:', error);
      setSendError(`Failed to send: ${error.message}`);
      return;
    }

    // Optimistically push UI update instantly
    if (data && data[0]) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data[0].id)) return prev;
        return [...prev, data[0]];
      });
      scrollToBottom();
    }

    // Determine the exact recipient logic for this specific thread
    let recipient = null;
    if (order.isDirectDm) {
      const parts = String(order.id).replace('dm_', '').split('_');
      recipient = parts.find((p) => p !== currentUser.username);
    } else {
      if (currentUser.username === order.donor) {
        recipient = order.claimedByUsername || order.claimedBy;
      } else {
        recipient = order.donor;
      }
    }

    // Ping the recipient with a Push/Toast notification
    if (recipient) {
      await supabase.from('notifications').insert([
        {
          user_id: recipient,
          type: order.isDirectDm ? 'DIRECT_MESSAGE' : 'ITEM_MESSAGE',
          title: order.isDirectDm
            ? `💬 New message from @${currentUser.username}`
            : `💬 Message about "${order.title || 'Item'}"`,
          body: textToSend,
          is_read: false,
        },
      ]);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl flex flex-col h-[550px] border border-slate-100 overflow-hidden">
        
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-700/60 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">{order.title || 'Chat'}</h3>
              <p className="text-[11px] text-emerald-100 font-medium">
                {order.isDirectDm ? 'Direct Message' : `Chatting about order #${order.id}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-emerald-700 rounded-xl transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sendError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-600 font-medium">
            {sendError}
          </div>
        )}

        <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-400 gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading chat...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-1">
              <MessageSquare className="w-8 h-8 opacity-40" />
              <p>No messages yet. Send a message to start communicating!</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = String(msg.sender_id) === String(currentUser?.id);
              return (
                <div
                  key={msg.id || index}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-slate-400 px-1 mb-0.5 font-medium">
                    {isMe ? 'You' : msg.sender_username}
                  </span>
                  <div
                    className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-xs shadow-sm font-medium ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:bg-slate-300 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
}