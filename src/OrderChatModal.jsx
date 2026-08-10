import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function OrderChatModal({ order, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendError, setSendError] = useState('');
  const chatEndRef = useRef(null);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!order?.id) return;

    // 1. Fetch initial message history
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', String(order.id))
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else if (data) {
        setMessages(data);
      }
      setIsLoading(false);
      scrollToBottom();
    };

    fetchMessages();

    // 2. Subscribe to real-time incoming messages for this order/DM
    const channel = supabase
      .channel(`chat_order_${order.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${order.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    // 1. Insert message into database (without .select() to prevent 400 response errors)
    const { error } = await supabase.from('messages').insert([msgPayload]);

    if (error) {
      console.error('Failed to send message:', error);
      setSendError(`Failed to send: ${error.message}`);
      return;
    }

    // 2. Determine recipient for push notification
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

    // 3. Insert notification record for recipient
    if (recipient) {
      await supabase.from('notifications').insert([
        {
          user_id: recipient,
          type: 'DIRECT_MESSAGE',
          title: `💬 New message from @${currentUser.username}`,
          body: textToSend,
        },
      ]);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl flex flex-col h-[550px] border border-slate-100 overflow-hidden">
        
        {/* CHAT HEADER */}
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

        {/* ERROR BANNER */}
        {sendError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-600 font-medium">
            {sendError}
          </div>
        )}

        {/* MESSAGES BODY */}
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

        {/* INPUT FORM */}
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