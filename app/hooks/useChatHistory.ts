import { useState, useEffect } from 'react';
import { Chat, Message } from '@/app/types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'gemini-chat-history';

export function useChatHistory() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setChats(parsed.chats || []);
      } catch (e) {
        console.error('Failed to parse chat history:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever chats change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats }));
    }
  }, [chats, isLoaded]);

  const createNewChat = (): string => {
    const newChat: Chat = {
      id: uuidv4(),
      title: 'Új beszélgetés',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    return newChat.id;
  };

  const updateChatTitle = (chatId: string, title: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, title, updatedAt: Date.now() } : chat
      )
    );
  };

  const deleteChat = (chatId: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  };

  const addMessage = (chatId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id === chatId) {
          const updatedMessages = [...chat.messages, newMessage];
          // Auto-generate title from first user message
          let title = chat.title;
          if (chat.messages.length === 0 && message.role === 'user') {
            title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
          }
          return {
            ...chat,
            messages: updatedMessages,
            title,
            updatedAt: Date.now(),
          };
        }
        return chat;
      })
    );
  };

  const updateLastMessage = (chatId: string, content: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id === chatId && chat.messages.length > 0) {
          const messages = [...chat.messages];
          const lastMessage = messages[messages.length - 1];
          if (lastMessage.role === 'assistant') {
            messages[messages.length - 1] = { ...lastMessage, content };
          }
          return { ...chat, messages, updatedAt: Date.now() };
        }
        return chat;
      })
    );
  };

  const currentChat = chats.find((chat) => chat.id === currentChatId) || null;

  return {
    chats,
    currentChat,
    currentChatId,
    setCurrentChatId,
    createNewChat,
    deleteChat,
    addMessage,
    updateLastMessage,
    updateChatTitle,
    isLoaded,
  };
}
