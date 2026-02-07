import { SimpleChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { sendMessage, getCompleteResponse } from '../services/chatgptWeb';

export interface ChatChatGPTWebInput extends BaseChatModelParams {
  accessToken: string;
  modelName: string;
  temperature?: number;
  topP?: number;
}

export class ChatChatGPTWeb extends SimpleChatModel {
  accessToken: string;
  modelName: string;
  temperature: number;
  topP: number;

  constructor(fields: ChatChatGPTWebInput) {
    super(fields);
    this.accessToken = fields.accessToken;
    this.modelName = fields.modelName;
    this.temperature = fields.temperature ?? 0.7;
    this.topP = fields.topP ?? 0.9;
  }

  _llmType(): string {
    return 'chatgpt_web';
  }

  private _formatMessages(messages: BaseMessage[]): string {
    let prompt = '';

    for (const message of messages) {
      const role = message._getType() as string;
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

      if (role === 'system') {
        prompt += `System: ${content}\n\n`;
      } else if (role === 'human' || role === 'user') {
        prompt += `User: ${content}\n\n`;
      } else if (role === 'ai' || role === 'assistant') {
        prompt += `Assistant: ${content}\n\n`;
      } else if (role === 'tool') {
        prompt += `Tool Output: ${content}\n\n`;
      } else {
        prompt += `${role}: ${content}\n\n`;
      }
    }

    prompt += 'Assistant:';

    return prompt;
  }

  async _call(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<string> {
    const prompt = this._formatMessages(messages);

    const response = await getCompleteResponse(this.accessToken, prompt, this.modelName);

    if (response.error) {
      throw new Error(`ChatGPT Web Error: ${response.error}`);
    }

    return response.text;
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const prompt = this._formatMessages(messages);

    let previousText = '';

    const stream = sendMessage(this.accessToken, prompt, this.modelName);

    for await (const chunk of stream) {
      if (chunk.type === 'error') {
        throw new Error(`ChatGPT Web Stream Error: ${chunk.content}`);
      }

      if (chunk.type === 'text' && chunk.content) {
        const currentText = chunk.content;
        const delta = currentText.slice(previousText.length);
        previousText = currentText;

        if (delta) {
          const chunkGeneration = new ChatGenerationChunk({
            message: new AIMessageChunk({ content: delta }),
            text: delta,
          });

          if (runManager) {
            await runManager.handleLLMNewToken(delta);
          }

          yield chunkGeneration;
        }
      }
    }
  }
}
