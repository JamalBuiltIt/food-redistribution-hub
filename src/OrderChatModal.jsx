import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, Loader2, Image, Video, Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function OrderChatModal({ order, currentUser, isChefTheme, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [sendError, setSendError] = useState('');
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const resolveChatId = () => {
    if (!order) return '';
    
    const currentUsername = currentUser?.username || currentUser?.name;
    const target = order.donor || order.chef_name || order.targetUsername;

    if (order.isDirectDm || String(order.id).startsWith('dm_')) {
      return String(order.id);
    }

    if (order.order_id && String(order.order_id).startsWith('dm_')) {
      return String(order.order_id);
    }

    if (order.targetUsername && currentUser) {
      const usernames = [currentUsername, order.targetUsername].sort();
      return `dm_${usernames[0]}_${usernames[1]}`;
    }

    return String(order.id || order.order_id || '');
  };

  const chatId = resolveChatId();

  useEffect(() => {
    if (!chatId || !currentUser) return;

    const fetchMessages = async () => {
      // 1. Check if this chatroom was hidden/deleted on this user's end
      const { data: hiddenData } = await supabase
        .from('hidden_chats')
        .select('*')
        .eq('user_username', currentUser.username)
        .eq('order_id', chatId)
        .maybeSingle();

      const hiddenTime = hiddenData ? new Date(hiddenData.created_at).getTime() : 0;

      // 2. Fetch messages for this chat
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else if (data) {
        // Filter out messages that were sent before the user cleared/deleted the chat on their end
        const visibleMessages = data.filter((msg) => {
          if (!hiddenTime) return true;
          return new Date(msg.created_at).getTime() > hiddenTime;
        });
        setMessages(visibleMessages);
      }
      setIsLoading(false);
    };

    fetchMessages().then(scrollToBottom);

    const pollingInterval = setInterval(() => {
      fetchMessages();
    }, 3000);

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
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (payload.old) {
            setMessages((prev) => prev.filter((m) => String(m.id) !== String(payload.old.id)));
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [chatId, currentUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleSendMessage = async (mediaUrl = null, mediaType = null) => {
    const textToSend = newMessage.trim();
    if ((!textToSend && !mediaUrl) || !currentUser || !chatId) return;

    setNewMessage('');
    setSendError('');

    const currentUsername = currentUser.username || currentUser.name || 'User';
    const currentUserId = currentUser.id ? String(currentUser.id) : currentUsername;

    const msgPayload = {
      order_id: chatId,
      sender_id: currentUserId,
      sender_username: currentUsername,
      content: textToSend,
      media_url: mediaUrl,
      media_type: mediaType,
    };

    // 1. Send the message to the database
    const { data, error } = await supabase.from('messages').insert([msgPayload]).select();

    if (error) {
      console.error('Failed to send message:', error);
      setSendError(`Failed to send: ${error.message}`);
      setNewMessage(textToSend);
      return;
    }

    if (data && data[0]) {
      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(data[0].id))) return prev;
        return [...prev, data[0]];
      });
      scrollToBottom();
    }

    // 2. Resolve Notification Recipient Dynamically
    try {
      let recipient = null;
      const isDmChat = chatId.startsWith('dm_');
      
      if (isDmChat) {
        const parts = chatId.replace('dm_', '').split('_');
        recipient = parts.find((p) => p !== currentUsername);
      } else {
        const otherUserMsg = messages.find(
          (m) => m.sender_username && m.sender_username !== currentUsername
        );
        
        if (otherUserMsg) {
          recipient = otherUserMsg.sender_username;
        } else {
          recipient = 
            order?.donor || 
            order?.chef_name || 
            order?.targetUsername || 
            order?.ownerUsername || 
            order?.claimedByUsername || 
            order?.user_id;
        }
      }

      // 3. Send Notification securely
      if (recipient && recipient !== currentUsername) {
        await supabase.from('notifications').insert([
          {
            user_id: recipient,
            type: isDmChat ? 'DIRECT_MESSAGE' : 'ITEM_MESSAGE',
            order_id: chatId,
            title: isDmChat
              ? `💬 New message from @${currentUsername}`
              : `💬 "${order?.title || 'Item'}"`,
            body: textToSend || (mediaType ? `Sent a ${mediaType}` : 'New attachment'),
            is_read: false,
          },
        ]);
      }
    } catch (notifErr) {
      console.error('Non-blocking notification error:', notifErr);
    }
  };

  // Handle Media Uploading Pipeline (Images / Videos)
  const handleMediaUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setSendError('');

    const fileExt = file.name.split('.').pop();
    const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('surplus-images')
      .upload(fileName, file);

    if (uploadError) {
      setSendError(`Upload failed: ${uploadError.message}`);
      setIsUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('surplus-images')
      .getPublicUrl(fileName);

    setIsUploading(false);
    if (publicUrlData?.publicUrl) {
      await handleSendMessage(publicUrlData.publicUrl, type);
    }
  };

  // Delete singular message (removes from database for all participants)
  const handleDeleteMessage = async (msgId) => {
    const { error } = await supabase.from('messages').delete().eq('id', msgId);
    if (!error) {
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(msgId)));
    } else {
      setSendError(`Failed to delete message: ${error.message}`);
    }
  };

  // Delete/Clear entire chatroom view on this user's end only
  const handleDeleteChatroomOnMyEnd = async () => {
    if (!window.confirm("Are you sure you want to clear this chat history from your view?")) return;

    const { error } = await supabase.from('hidden_chats').upsert([
      {
        user_username: currentUser.username,
        order_id: chatId,
        created_at: new Date().toISOString()
      }
    ], { onConflict: 'user_username,order_id' });

    if (!error) {
      onClose();
    } else {
      setSendError("Failed to clear chat view on your end.");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl flex flex-col h-[550px] border border-slate-100 overflow-hidden">
        
        {/* HEADER */}
        <div className={`p-4 text-white flex justify-between items-center shrink-0 ${isChefTheme ? 'bg-amber-700' : 'bg-emerald-600'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isChefTheme ? 'bg-amber-800/60' : 'bg-emerald-700/60'}`}>
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">
                {order?.title || (chatId.startsWith('dm_') ? `Direct Message` : `Chat #${chatId}`)}
              </h3>
              <p className={`text-[11px] font-medium ${isChefTheme ? 'text-amber-100' : 'text-emerald-100'}`}>
                {chatId.startsWith('dm_') ? 'Direct Chat' : `Chatting about order`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDeleteChatroomOnMyEnd}
              className="px-2.5 py-1.5 bg-black/20 hover:bg-black/40 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
              title="Delete chatroom on your end"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Chat
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-xl transition-colors text-white ${isChefTheme ? 'hover:bg-amber-800' : 'hover:bg-emerald-700'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                    className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-xs shadow-sm font-medium relative group ${
                      isMe
                        ? isChefTheme 
                          ? 'bg-amber-700 text-white rounded-br-none' 
                          : 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}
                  >
                    {contentText && <p className="leading-relaxed">{contentText}</p>}

                    {/* Media Content: Image */}
                    {msg.media_type === 'image' && (
                      <img src={msg.media_url} alt="Shared Attachment" className="mt-2 rounded-xl max-h-48 object-cover w-full" />
                    )}

                    {/* Media Content: Video */}
                    {msg.media_type === 'video' && (
                      <video controls src={msg.media_url} className="mt-2 rounded-xl max-h-48 object-cover w-full" />
                    )}

                    {/* Delete individual message button (visible on hover for user's own messages) */}
                    {isMe && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="absolute -top-2 -left-2 bg-white text-slate-600 hover:text-rose-600 border border-slate-200 p-1 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete message"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* INPUT FORM WITH MEDIA ACTIONS */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0"
        >
          {/* Image Upload Icon */}
          <label className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors" title="Send Image">
            <Image className="w-4 h-4" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleMediaUpload(e, 'image')} />
          </label>

          {/* Video Upload Icon */}
          <label className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors" title="Send Video">
            <Video className="w-4 h-4" />
            <input type="file" accept="video/*" className="hidden" onChange={(e) => handleMediaUpload(e, 'video')} />
          </label>

          <input
            type="text"
            placeholder={isUploading ? "Uploading media..." : "Type a message..."}
            disabled={isUploading}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className={`flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50 ${
              isChefTheme ? 'focus:ring-2 focus:ring-amber-500' : 'focus:ring-2 focus:ring-emerald-500'
            }`}
          />

          <button
            type="submit"
            disabled={isUploading || !newMessage.trim()}
            className={`px-4 py-2.5 text-white rounded-xl disabled:bg-slate-300 transition-colors shrink-0 flex items-center justify-center ${
              isChefTheme ? 'bg-amber-700 hover:bg-amber-800' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>

      </div>
    </div>
  );
}