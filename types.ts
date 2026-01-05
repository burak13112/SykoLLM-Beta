
export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  isError?: boolean;
  images?: string[]; // Base64 strings
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  tag: string; // e.g., ALPHA, BETA
  description: string;
  supportsImages: boolean; // Vision support flag
}

export enum Theme {
  DARK = 'dark',
  LIGHT = 'light',
}

export interface UserWallet {
  balance: number;
  proCredits: number; // Purchased extra messages for Pro model
}

export interface ModelUsage {
  text: number;
  imageGen: number;
  vision: number;
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  v25: ModelUsage;
  pro: ModelUsage;
  super: ModelUsage;
  coder: ModelUsage;
}