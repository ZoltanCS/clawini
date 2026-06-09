// Simple token estimation without native dependencies
// Based on OpenAI's approach: ~4 characters per token on average for English/Hungarian

export function countTokens(text: string): number {
  if (!text) return 0;
  
  // For Hungarian and mixed text, use a more conservative estimate
  // Hungarian tends to have longer words than English
  const charCount = text.length;
  
  // Rough estimate: 
  // - English: ~4 chars/token
  // - Hungarian: ~3.5 chars/token (longer words)
  // - Code: ~3 chars/token
  // - Mixed: use conservative 3.2
  
  return Math.ceil(charCount / 3.2);
}

export function countMessageTokens(messages: Array<{role: string; content: string}>): number {
  let total = 0;
  
  for (const msg of messages) {
    // Base tokens per message (formatting tokens)
    total += 4;
    
    // Role tokens (usually 1-2 tokens)
    total += 1;
    
    // Content tokens
    total += countTokens(msg.content);
  }
  
  // Add tokens for the response (assistant prefix)
  total += 3;
  
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
