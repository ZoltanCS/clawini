export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  parent_chat_id?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: 'hu' | 'en';
  notifications: boolean;
  auto_save: boolean;
}

export interface ChatError {
  message: string;
  retryFn?: () => void;
  timestamp: number;
}
