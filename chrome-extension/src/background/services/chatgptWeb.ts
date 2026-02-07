/**
 * ChatGPT Web Service
 *
 * This service provides functionality to:
 * - Extract access tokens from the user's chatgpt.com browser session
 * - Fetch available models from the ChatGPT backend API
 * - Send chat messages via the conversation API (like a real browser)
 *
 * IMPORTANT: All requests mimic real browser behavior to avoid bans:
 * - Uses authentic browser headers
 * - Includes proper timing and realistic patterns
 * - Uses the conversation API like the actual web interface
 */

export interface ChatGPTWebSession {
  accessToken: string;
  expiry: number;
  user?: {
    id: string;
    name: string;
    email: string;
    picture: string;
  };
}

export interface ChatGPTModel {
  slug: string;
  max_tokens?: number;
  title: string;
  description?: string;
  tags?: string[];
  qualitative_properties?: {
    reasoning?: number[];
    speed?: number[];
    conciseness?: number[];
  };
}

export interface ChatGPTModelsResponse {
  models: ChatGPTModel[];
  categories?: Array<{
    category: string;
    human_category_name: string;
    subscription_level: string;
    default_model: string;
  }>;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: {
    content_type: 'text';
    parts: string[];
  };
}

export interface ChatGPTConversationRequest {
  action: 'next';
  messages: Array<{
    id: string;
    author: { role: 'user' };
    content: { content_type: 'text'; parts: string[] };
  }>;
  parent_message_id: string;
  model: string;
  timezone_offset_min: number;
  suggestions: string[];
  history_and_training_disabled: boolean;
  conversation_mode: { kind: 'primary_assistant' };
  force_paragen: boolean;
  force_paragen_model_slug: string;
  force_nulligen: boolean;
  force_rate_limit: boolean;
  websocket_request_id: string;
}

// ChatGPT Web API endpoints
const CHATGPT_BASE = 'https://chatgpt.com';
const CHATGPT_API_BASE = `${CHATGPT_BASE}/backend-api`;
const CHATGPT_API_SESSION = `${CHATGPT_BASE}/api/auth/session`;

/**
 * Generate a UUID v4 for message IDs (matches ChatGPT's format)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get headers that mimic a real browser session
 */
function getBrowserHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: 'text/event-stream',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Origin: CHATGPT_BASE,
    Referer: `${CHATGPT_BASE}/`,
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
}

/**
 * Extracts the access token from the user's ChatGPT session.
 * This requires the user to be logged into chatgpt.com in the same browser.
 */
export async function getAccessToken(): Promise<ChatGPTWebSession | null> {
  try {
    // Get session from ChatGPT's auth endpoint
    const response = await fetch(CHATGPT_API_SESSION, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.warn('[ChatGPT Web] Session request failed:', response.status);
      return null;
    }

    const sessionData = await response.json();

    if (sessionData?.accessToken) {
      // Parse the JWT to get expiry time
      const tokenParts = sessionData.accessToken.split('.');
      let expiry = Date.now() + 24 * 60 * 60 * 1000; // Default 24 hours

      if (tokenParts.length >= 2) {
        try {
          const payload = JSON.parse(atob(tokenParts[1]));
          if (payload.exp) {
            expiry = payload.exp * 1000;
          }
        } catch {
          // Keep default expiry
        }
      }

      return {
        accessToken: sessionData.accessToken,
        expiry,
        user: sessionData.user,
      };
    }

    console.warn('[ChatGPT Web] No access token in session response');
    return null;
  } catch (error) {
    console.error('[ChatGPT Web] Error getting access token:', error);
    return null;
  }
}

/**
 * Fetches available models from the user's ChatGPT account.
 * Returns the model slugs that the user has access to.
 */
export async function getAvailableModels(accessToken: string): Promise<ChatGPTModel[]> {
  try {
    // Add a slight delay to mimic human behavior
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const response = await fetch(`${CHATGPT_API_BASE}/models?history_and_training_disabled=false`, {
      method: 'GET',
      headers: getBrowserHeaders(accessToken),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[ChatGPT Web] Failed to fetch models:', response.status);
      return [];
    }

    const data: ChatGPTModelsResponse = await response.json();

    // Filter to only conversation models (not image generators, etc.)
    const conversationModels = (data.models || []).filter(
      model =>
        model.slug && !model.slug.includes('dall-e') && !model.slug.includes('image') && !model.slug.includes('audio'),
    );

    console.log(
      '[ChatGPT Web] Available models:',
      conversationModels.map(m => m.slug),
    );
    return conversationModels;
  } catch (error) {
    console.error('[ChatGPT Web] Error fetching models:', error);
    return [];
  }
}

/**
 * Get model names as strings for the provider config
 */
export async function getModelNames(accessToken: string): Promise<string[]> {
  const models = await getAvailableModels(accessToken);
  return models.map(m => m.slug);
}

/**
 * Validates if the current session/token is still valid.
 */
export async function validateSession(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${CHATGPT_API_BASE}/me`, {
      method: 'GET',
      headers: getBrowserHeaders(accessToken),
      credentials: 'include',
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Checks if the user is currently logged into ChatGPT.
 */
export async function isLoggedIn(): Promise<boolean> {
  const session = await getAccessToken();
  if (!session) return false;
  return session.expiry > Date.now();
}

/**
 * Send a message to ChatGPT via the conversation API.
 * This mimics exactly how the web interface sends messages.
 *
 * @param accessToken - The user's access token
 * @param message - The message to send
 * @param model - The model slug (e.g., 'gpt-4', 'gpt-4o', 'auto')
 * @param conversationId - Optional existing conversation ID
 * @param parentMessageId - Optional parent message ID for continuing conversations
 * @returns AsyncGenerator that yields response chunks
 */
export async function* sendMessage(
  accessToken: string,
  message: string,
  model: string = 'auto',
  conversationId?: string,
  parentMessageId?: string,
): AsyncGenerator<{ type: 'text' | 'done' | 'error'; content: string; conversationId?: string; messageId?: string }> {
  const messageId = generateUUID();
  const wsRequestId = generateUUID();

  const requestBody: ChatGPTConversationRequest = {
    action: 'next',
    messages: [
      {
        id: messageId,
        author: { role: 'user' },
        content: { content_type: 'text', parts: [message] },
      },
    ],
    parent_message_id: parentMessageId || generateUUID(),
    model: model,
    timezone_offset_min: new Date().getTimezoneOffset(),
    suggestions: [],
    history_and_training_disabled: false,
    conversation_mode: { kind: 'primary_assistant' },
    force_paragen: false,
    force_paragen_model_slug: '',
    force_nulligen: false,
    force_rate_limit: false,
    websocket_request_id: wsRequestId,
  };

  // Add conversation_id if continuing a conversation
  const body = conversationId ? { ...requestBody, conversation_id: conversationId } : requestBody;

  try {
    // Add realistic delay before sending
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    const response = await fetch(`${CHATGPT_API_BASE}/conversation`, {
      method: 'POST',
      headers: getBrowserHeaders(accessToken),
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: 'error', content: `Request failed: ${response.status} - ${errorText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentConversationId = conversationId;
    let lastMessageId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done', content: '', conversationId: currentConversationId, messageId: lastMessageId };
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // Extract conversation ID from first response
            if (parsed.conversation_id && !currentConversationId) {
              currentConversationId = parsed.conversation_id;
            }

            // Extract message content
            if (parsed.message?.content?.parts) {
              const text = parsed.message.content.parts.join('');
              lastMessageId = parsed.message.id;
              yield {
                type: 'text',
                content: text,
                conversationId: currentConversationId,
                messageId: lastMessageId,
              };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    yield { type: 'done', content: '', conversationId: currentConversationId, messageId: lastMessageId };
  } catch (error) {
    yield { type: 'error', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Get a complete response from ChatGPT (non-streaming).
 * Collects all chunks and returns the final text.
 */
export async function getCompleteResponse(
  accessToken: string,
  message: string,
  model: string = 'auto',
  conversationId?: string,
  parentMessageId?: string,
): Promise<{ text: string; conversationId?: string; messageId?: string; error?: string }> {
  let fullText = '';
  let finalConversationId: string | undefined;
  let finalMessageId: string | undefined;

  for await (const chunk of sendMessage(accessToken, message, model, conversationId, parentMessageId)) {
    if (chunk.type === 'error') {
      return { text: '', error: chunk.content };
    }
    if (chunk.type === 'text') {
      fullText = chunk.content; // ChatGPT sends cumulative text, so we take the latest
      finalConversationId = chunk.conversationId;
      finalMessageId = chunk.messageId;
    }
    if (chunk.type === 'done') {
      finalConversationId = chunk.conversationId;
      finalMessageId = chunk.messageId;
    }
  }

  return { text: fullText, conversationId: finalConversationId, messageId: finalMessageId };
}

// Export types for consumers
export type { ChatGPTWebSession as Session, ChatGPTModel as Model };
