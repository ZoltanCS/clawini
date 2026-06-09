import { encoding_for_model } from 'js-tiktoken';

// Get encoder for GPT-4 (closest to Gemini tokenization)
const encoder = encoding_for_model('gpt-4');

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
