import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Chat, Message } from '@/app/types';
import { User } from '@supabase/supabase-js';

export function useSupabaseChat(user: User | null) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load user's chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      setCurrentChatId(null);
      return;
    }

    const loadChats = async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading chats:', error);
        return;
      }

      setChats(data || []);
    };

    loadChats();

    // Subscribe to changes
    const subscription = supabase
      .channel('chats')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'chats', filter: `user_id=eq.${user.id}` },
        (payload) => {
          loadChats();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const createNewChat = async (): Promise<string | null> => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('chats')
      .insert({
        user_id: user.id,
        title: 'Új beszélgetés',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat:', error);
      return null;
    }

    setChats((prev) => [data, ...prev]);
    setCurrentChatId(data.id);
    return data.id;
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting chat:', error);
      return;
    }

    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  };

  const updateChatTitle = async (chatId: string, title: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('chats')
      // Don't touch updated_at: renaming a chat must not re-sort the chat list
      .update({ title })
      .eq('id', chatId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating chat:', error);
      return;
    }

    // Optimistic update so the new title shows even if realtime is slow
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title } : c)));
  };

  const addMessage = async (chatId: string, role: 'user' | 'assistant', content: string, imageUrls?: string[] | string | null) => {
    let imageUrl: string | null = null;

    if (imageUrls) {
      if (Array.isArray(imageUrls)) {
        imageUrl = imageUrls.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls);
      } else {
        imageUrl = imageUrls;
      }
    }

    const { error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        role,
        content,
        image_url: imageUrl,
      });

    if (error) {
      console.error('Error adding message:', error);
      return false;
    }
    return true;
  };

  const loadMessages = async (chatId: string): Promise<Message[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
      return [];
    }

    return data || [];
  };

  const uploadImage = async (file: File, chatId: string): Promise<string | null> => {
    if (!user) throw new Error('A kép feltöltéséhez előbb jelentkezz be.');

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    let uploadedPath = '';
    let uploadError: { message: string; statusCode?: string; error?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fileName = `${user.id}/${chatId}/${uniqueId}.${fileExt}`;
      const result = await supabase.storage
        .from('chat-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          contentType: file.type || `image/${fileExt}`,
        });
      uploadError = result.error;
      if (!uploadError) {
        uploadedPath = fileName;
        break;
      }

      const status = Number(uploadError.statusCode);
      const retryable = !status || status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      const status = Number(uploadError.statusCode);
      const detail = [uploadError.error, uploadError.message].filter((value, index, all) => value && all.indexOf(value) === index).join(': ');
      if (status === 401) throw new Error('Lejárt a bejelentkezésed. Jelentkezz be újra a kép feltöltéséhez.');
      if (status === 403) throw new Error(`A Supabase Storage nem engedélyezte a feltöltést (403). Ellenőrizd a chat-images bucket jogosultságait. ${detail}`);
      if (status === 413) throw new Error('A kép túl nagy a tárhely számára.');
      if (status === 429) throw new Error('A képtárhely túl sok kérést kapott. Várj pár másodpercet, majd próbáld újra.');
      if (status >= 500) throw new Error(`A Supabase képtárhelye hibát adott (${status}). A képek megmaradtak; próbáld újra.`);
      if (!status && /failed to fetch|network request failed|networkerror|fetch failed/i.test(detail)) {
        throw new Error('A Supabase képtárhelye nem válaszol, bár az internetkapcsolatod működik. Ellenőrizd a tárhely elérhetőségét, majd próbáld újra.');
      }
      throw new Error(`A Supabase képtárhely visszautasította a feltöltést${status ? ` (${status})` : ''}: ${detail || 'ismeretlen hiba'}`);
    }

    const { data } = supabase.storage
      .from('chat-images')
      .getPublicUrl(uploadedPath);

    return data.publicUrl;
  };

  const currentChat = chats.find((chat) => chat.id === currentChatId) || null;

  return {
    chats,
    currentChat,
    currentChatId,
    setCurrentChatId,
    createNewChat,
    deleteChat,
    updateChatTitle,
    addMessage,
    loadMessages,
    uploadImage,
    isLoading,
  };
}
