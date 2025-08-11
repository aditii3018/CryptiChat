import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Plus, Image as ImageIcon, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Cryptography } from '../lib/crypto';
import { Steganography } from '../lib/steganography';
import { useNavigate } from 'react-router-dom';

interface Message {
  id: string;
  sender_id: string;
  encrypted_content: string;
  shift_keys: number[];
  vigenere_key: string;
  steg_image_url?: string;
  created_at: string;
}

interface Chat {
  id: string;
  name: string;
  is_group: boolean;
  participant_count?: number;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  online_at?: string;
}

const MESSAGES_PER_PAGE = 50;

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Update user's online status
    const updateOnlineStatus = async () => {
      if (user.id) {
        await supabase
          .from('profiles')
          .update({ online_at: new Date().toISOString() })
          .eq('id', user.id);
      }
    };

    // Update online status every 30 seconds
    updateOnlineStatus();
    const interval = setInterval(updateOnlineStatus, 30000);

    loadChats();
    
    // Subscribe to chat updates
    const subscription = supabase
      .channel('chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, handleNewMessage)
      .on('presence', { event: 'sync' }, () => {
        const presenceState = subscription.presenceState();
        const onlineUserIds = new Set(
          Object.values(presenceState)
            .flat()
            .map((presence: any) => presence.user_id)
        );
        setOnlineUsers(onlineUserIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user) {
          await subscription.track({ user_id: user.id });
        }
      });

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [user, navigate]);

  useEffect(() => {
    if (selectedChat && user) {
      loadMessages(selectedChat.id);
    }
  }, [selectedChat, user]);

  const handleScroll = async () => {
    if (!messagesContainerRef.current || !hasMore || loadingMore) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    if (scrollTop === 0) {
      await loadMoreMessages();
    }
  };

  const loadMoreMessages = async () => {
    if (!selectedChat || !hasMore || loadingMore) return;

    setLoadingMore(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', selectedChat.id)
        .order('created_at', { ascending: false })
        .range(messages.length, messages.length + MESSAGES_PER_PAGE - 1);

      if (error) throw error;

      if (data) {
        if (data.length < MESSAGES_PER_PAGE) {
          setHasMore(false);
        }
        setMessages(prev => [...prev, ...data.reverse()]);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  async function loadChats() {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          chat_participants!inner(profile_id),
          chat_participants:chat_participants(count)
        `)
        .eq('chat_participants.profile_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const chatsWithCount = data?.map(chat => ({
        ...chat,
        participant_count: chat.chat_participants[0].count
      })) || [];

      setChats(chatsWithCount);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(chatId: string) {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .limit(MESSAGES_PER_PAGE);

      if (error) throw error;
      setMessages(data || []);
      setHasMore(data?.length === MESSAGES_PER_PAGE);
      scrollToBottom();
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  function handleNewMessage(payload: any) {
    if (payload.new && payload.new.chat_id === selectedChat?.id) {
      setMessages(current => [...current, payload.new]);
      scrollToBottom();
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat || !user?.id) return;

    try {
      const useSteg = Math.random() < 0.3; // 30% chance to use steganography
      let messageData;

      if (useSteg) {
        const { imageUrl, data } = await Steganography.hideMessage(newMessage);
        messageData = {
          chat_id: selectedChat.id,
          sender_id: user.id,
          encrypted_content: data.encryptedMessage,
          shift_keys: data.shiftKeys,
          vigenere_key: data.vigenereKey,
          steg_image_url: imageUrl,
        };
      } else {
        const encrypted = Cryptography.encrypt(newMessage);
        messageData = {
          chat_id: selectedChat.id,
          sender_id: user.id,
          encrypted_content: encrypted.cipherText,
          shift_keys: encrypted.shiftKeys,
          vigenere_key: encrypted.vigenereKey,
        };
      }

      const { error } = await supabase.from('messages').insert([messageData]);

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async function searchUsers(email: string) {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, online_at')
        .ilike('email', `%${email}%`)
        .neq('id', user.id)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  }

  async function createNewChat(isGroup: boolean = false) {
    if (!user?.id || (!isGroup && !searchResults.length)) return;

    try {
      // Create new chat
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert([
          {
            name: isGroup ? newChatName : searchResults[0].full_name,
            is_group: isGroup,
            created_by: user.id,
          },
        ])
        .select()
        .single();

      if (chatError) throw chatError;

      // Add participants
      const participants = [
        { chat_id: chatData.id, profile_id: user.id },
        ...searchResults.map(profile => ({
          chat_id: chatData.id,
          profile_id: profile.id,
        })),
      ];

      const { error: participantError } = await supabase
        .from('chat_participants')
        .insert(participants);

      if (participantError) throw participantError;

      setShowNewChatModal(false);
      setNewChatName('');
      setSearchEmail('');
      setSearchResults([]);
      loadChats();
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  }

  function decryptMessage(message: Message): string {
    try {
      return Cryptography.decrypt(
        message.encrypted_content,
        message.shift_keys,
        message.vigenere_key
      );
    } catch (error) {
      console.error('Error decrypting message:', error);
      return '[Error decrypting message]';
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-primary-500 to-primary-700">
      {/* Sidebar */}
      <div className="w-80 glass-effect border-r border-white/20">
        <div className="p-6 flex items-center justify-between border-b border-white/20">
          <h2 className="text-white text-xl font-semibold">Messages</h2>
          <button
            onClick={() => setShowNewChatModal(true)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={`w-full px-6 py-4 text-left transition-colors ${
                selectedChat?.id === chat.id
                  ? 'bg-white/20 text-white'
                  : 'hover:bg-white/10 text-white/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-primary-300 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-primary-700" />
                  </div>
                  <div>
                    <p className="font-medium">{chat.name}</p>
                    {chat.participant_count && (
                      <p className="text-sm text-white/60">
                        {chat.participant_count} {chat.participant_count === 1 ? 'member' : 'members'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col glass-effect">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-full bg-primary-300 flex items-center justify-center">
                    <MessageCircle className="h-6 w-6 text-primary-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{selectedChat.name}</h3>
                    {selectedChat.participant_count && (
                      <p className="text-sm text-white/60">
                        {selectedChat.participant_count} {selectedChat.participant_count === 1 ? 'member' : 'members'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {loadingMore && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.sender_id === user?.id ? 'justify-end' : 'justify-start'
                  } message-animation`}
                >
                  <div
                    className={`max-w-xs md:max-w-md p-4 rounded-2xl shadow-lg ${
                      message.sender_id === user?.id
                        ? 'bg-primary-600 text-white ml-12'
                        : 'bg-white text-gray-900 mr-12'
                    }`}
                  >
                    {message.steg_image_url ? (
                      <div className="space-y-3">
                        <img
                          src={message.steg_image_url}
                          alt="Steganographic message"
                          className="rounded-lg max-w-full h-auto"
                          loading="lazy"
                        />
                        <p className="text-sm">{decryptMessage(message)}</p>
                      </div>
                    ) : (
                      <p className="text-sm">{decryptMessage(message)}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-6 border-t border-white/20">
              <form onSubmit={sendMessage} className="flex space-x-4">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 bg-white/10 text-white placeholder-white/60 rounded-full focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <button
                  type="submit"
                  className="p-3 rounded-full bg-white text-primary-600 hover:bg-white/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-white/60 text-lg">Select a chat to start messaging</div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Start New Chat</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Search by Email
                </label>
                <input
                  type="email"
                  value={searchEmail}
                  onChange={(e) => {
                    setSearchEmail(e.target.value);
                    if (e.target.value) {
                      searchUsers(e.target.value);
                    } else {
                      setSearchResults([]);
                    }
                  }}
                  className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter email address"
                />
              </div>

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {searchResults.map((profile) => (
                    <div
                      key={profile.id}
                      className="p-4 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        <span>{profile.email}</span>
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            onlineUsers.has(profile.id)
                              ? 'bg-green-500'
                              : 'bg-gray-300'
                          }`}
                        />
                      </div>
                      <button
                        onClick={() => createNewChat(false)}
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-full"
                      >
                        <UserPlus className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowNewChatModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}