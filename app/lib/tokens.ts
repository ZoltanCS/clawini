import { get_encoding } from 'tiktoken';

// Get encoder for cl100k_base (GPT-4/GPT-3.5 tokenizer - closest to Gemini)
const encoder = get_encoding('cl100k_base');

export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch {
    // Fallback: estimate ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}

export function countMessageTokens(messages: Array<{role: string; content: string}>): number {
  let total = 0;
  
  for (const msg of messages) {
    // Base tokens per message
    total += 4; // <|start|>, role, content, <|end|>
    
    // Role tokens
    total += countTokens(msg.role);
    
    // Content tokens
    total += countTokens(msg.content);
  }
  
  // Add tokens for the response
  total += 3; // <|start|>assistant<|message|>
  
  return total;
}

export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(2) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k';
  }
  return count.toString();
}
