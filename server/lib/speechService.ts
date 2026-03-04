import OpenAI from 'openai';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createClaudeClient } from './claude';

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const claudeModel =
  process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL_BALANCED ||
  'claude-sonnet-4-5';

export interface VoiceResponseOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
}

export interface DeepThinkingResult {
  reasoning: string;
  response: string;
  needsDeepThinking: boolean;
}

export async function generateDeepThinkingResponse(
  prompt: string,
  context?: string,
  isVoiceMode: boolean = false
): Promise<DeepThinkingResult> {
  const voiceInstructions = isVoiceMode ? `
IMPORTANT: You are in a VOICE CONVERSATION. Your response will be spoken aloud.
- Keep responses concise and natural for speech (2-4 sentences max for simple queries)
- Use conversational language, contractions, and natural flow
- Avoid long lists, technical jargon, or text-only formatting
- For complex tasks, acknowledge the request and confirm what you'll do
- Speak directly and personally, as if talking to someone
` : '';

  const systemPrompt = `You are the Chairman's Assistant, a highly capable AI that helps manage a multi-agent organization.
You provide conversational, helpful responses and can think deeply about complex tasks when needed.
${voiceInstructions}
When analyzing requests:
- For simple queries (greetings, basic navigation): respond directly and conversationally
- For complex tasks (creating agents, scheduling meetings, analyzing data): acknowledge the task, engage deep reasoning, and confirm action

${context ? `\nContext: ${context}` : ''}`;

  try {
    // Use Claude as primary (OpenAI may not be configured)
    const claude = createClaudeClient();
    
    if (!claude) {
      throw new Error('Claude client not available. Please check your API configuration.');
    }
    
    console.log('[SpeechService] Using Claude for response generation');
      
    const claudeResponse = await claude.messages.create({
      model: claudeModel,
      max_tokens: isVoiceMode ? 500 : 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const response = claudeResponse.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('')
      .trim();

    const isComplexTask = prompt.length > 100 || 
                          /create|schedule|analyze|plan|organize|coordinate|add|remove|delete|update/i.test(prompt);

    if (isComplexTask) {
      const reasoningResponse = await claude.messages.create({
        model: claudeModel,
        max_tokens: 200,
        temperature: 0.5,
        system: 'Provide a brief internal reasoning trace (2-3 sentences) explaining your thought process for this task.',
        messages: [
          {
            role: 'user',
            content: `Task: ${prompt}\nResponse: ${response}`
          }
        ]
      });

      const reasoning = reasoningResponse.content
        .filter((block) => block.type === 'text')
        .map((block) => block.type === 'text' ? block.text : '')
        .join('')
        .trim();

      console.log('[SpeechService] ✓ Successfully generated response (with reasoning)');
      return {
        reasoning,
        response,
        needsDeepThinking: true,
      };
    }

    console.log('[SpeechService] ✓ Successfully generated response');
    return {
      reasoning: '',
      response,
      needsDeepThinking: false,
    };
  } catch (error) {
    console.error('[SpeechService] Error generating deep thinking response:', error);
    throw error;
  }
}

export async function generateSpeech(
  text: string,
  options: VoiceResponseOptions = {}
): Promise<string> {
  // OpenAI TTS is optional - return empty if not configured
  if (!openai) {
    console.log('[SpeechService] OpenAI not configured - returning text-only response');
    return '';
  }
  
  try {
    const { voice = 'nova', speed = 1.0 } = options;

    const audioDir = join(process.cwd(), 'public', 'audio');
    await mkdir(audioDir, { recursive: true });

    const filename = `${randomUUID()}.mp3`;
    const filepath = join(audioDir, filename);

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      speed,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await writeFile(filepath, buffer);

    return `/audio/${filename}`;
  } catch (error: any) {
    // Gracefully handle TTS failures (quota, rate limit, etc.)
    const isQuotaError = 
      error?.status === 429 || 
      error?.code === 'insufficient_quota' ||
      error?.message?.includes('quota') ||
      error?.message?.includes('rate_limit');
    
    if (isQuotaError) {
      console.log('[SpeechService] OpenAI TTS quota exceeded - text response will be delivered without audio');
      return '';
    }
    
    console.error('[SpeechService] Error generating speech:', error);
    return '';
  }
}

export async function generateVoiceResponse(
  prompt: string,
  context?: string,
  voiceOptions?: VoiceResponseOptions
): Promise<{
  text: string;
  audioUrl: string;
  reasoning?: string;
  needsDeepThinking: boolean;
}> {
  const thinkingResult = await generateDeepThinkingResponse(prompt, context, true);
  
  // Try to generate audio, but don't fail if TTS is unavailable
  let audioUrl = '';
  try {
    audioUrl = await generateSpeech(thinkingResult.response, voiceOptions);
  } catch (error) {
    console.log('[SpeechService] Audio generation failed, delivering text-only response');
    // Continue without audio - text response is more important
  }

  return {
    text: thinkingResult.response,
    audioUrl,
    reasoning: thinkingResult.reasoning,
    needsDeepThinking: thinkingResult.needsDeepThinking,
  };
}
