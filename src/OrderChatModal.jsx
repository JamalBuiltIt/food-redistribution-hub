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

  // Robustly resolve the chat thread ID regardless of whether it came from 
  // an order click, a notification click, or a direct message search lookup.
  const resolveChatId = () => {
    if (!order) return '';
    
    // 1. If it's explicitly passed as a DM or already has a structured id
    if (order.isDirectDm || String(order.id).startsWith('dm_')) {
      return String(order.id);
    }

    // 2. If it came from a notification that mapped order_id as a DM format
    if (order.order_id && String(order.order_id).startsWith('dm_')) {
      return String(order.order_id);
    }

    // 3. If we are looking at a user profile / direct message search target passed via order object
    if (order.targetUsername && currentUser) {
      const usernames = [currentUser.username || currentUser.name, order.targetUsername].sort();
      return `dm_${usernames[0]}_${usernames[1]}`;
    }

    // 4. Default standard order ID
    return String(order.id || order.order_id || '');
  };

  const chatId = resolveChatId();

  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else if (data) {
        setMessages(data);
      }
      setIsLoading(false);
    };

    fetchMessages().then(scrollToBottom);

    // Failsafe polling engine (runs every 3 seconds)
    const pollingInterval = setInterval(() => {
      fetchMessages();
    }, 3000);

    // Supabase Realtime Listener using the uniform chatId
    const channelName = `chat_thread_${chatId.replace(/[^a-zA-Z0-9]/g, '')}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `order_id=eq.${chatId}`,
        },
        (payload) => {
          if (payload.new) {
            setMessages((prev) => {
              if (prev.some((m) => String(m.id) === String(payload.new.id))) return prev;
              const newChat = [...prev, payload.new];
              setTimeout(scrollToBottom, 50);
              return newChat;
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const textToSend = newMessage.trim();
    if (!textToSend || !currentUser || !chatId) return;

    setNewMessage('');
    setSendError('');

    const currentUsername = currentUser.username || currentUser.name || 'User';
    const currentUserId = currentUser.id ? String(currentUser.id) : currentUsername;

    const msgPayload = {
      order_id: chatId,
      sender_id: currentUserId,
      sender_username: currentUsername,
      content: textToSend,
    };

    const { data, error } = await supabase.from('messages').insert([msgPayload]).select();

    if (error) {
      console.error('Failed to send message:', error);
      setSendError(`Failed to send: ${error.message}`);
      setNewMessage(textToSend); // Restore input on failure
      return;
    }

    if (data && data[0]) {
      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(data[0].id))) return prev;
        return [...prev, data[0]];
      });
      scrollToBottom();
    }

    // Determine recipient for notifications
    let recipient = null;
    const isDmChat = chatId.startsWith('dm_');
    if (isDmChat) {
      const parts = chatId.replace('dm_', '').split('_');
      recipient = parts.find((p) => p !== currentUsername);
    } else if (order.donor && order.donor !== currentUsername) {
      recipient = order.donor;
    } else if (order.claimedByUsername && order.claimedByUsername !== currentUsername) {
      recipient = order.claimedByUsername;
    }

    if (recipient) {
      await supabase.from('notifications').insert([
        {
          user_id: recipient,
          type: isDmChat ? 'DIRECT_MESSAGE' : 'ITEM_MESSAGE',
          order_id: chatId,
          title: isDmChat
            ? `💬 New message from @${currentUsername}`
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
        
        {/* HEADER */}
        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-700/60 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">
                {order.title || (chatId.startsWith('dm_') ? `Direct Message` : `Chat #${chatId}`)}
              </h3>
              <p className="text-[11px] text-emerald-100 font-medium">
                {chatId.startsWith('dm_') ? 'Direct Chat' : `Chatting about order #${chatId}`}
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

        {/* MESSAGES CONTAINER */}
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
              const currentUsername = currentUser?.username || currentUser?.name;
              const senderUser = msg.sender_username;
              
              const isMe = 
                (msg.sender_id && currentUser?.id && String(msg.sender_id) === String(currentUser.id)) ||
                (senderUser && currentUsername && senderUser === currentUsername);

              const contentText = msg.content || '';

              return (
                <div
                  key={msg.id || index}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-slate-400 px-1 mb-0.5 font-medium">
                    {isMe ? 'You' : (senderUser || 'User')}
                  </span>
                  <div
                    className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-xs shadow-sm font-medium ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}
                  >
                    {contentText}
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