import { logger } from "./logger";

// Log API key presence on startup (never log the actual key)
console.log('UNCENSORED_CHAT_API_KEY:', process.env.UNCENSORED_CHAT_API_KEY ? 'present' : 'missing');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'present' : 'missing');
console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? 'present' : 'missing');

const OPENROUTER_MODELS = [
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'nousresearch/hermes-3-llama-3.1-8b:free',
  'openrouter/free',
];

interface Message {
  role: string;
  content: string;
}

export async function generateAIReply(
  systemPrompt: string,
  messageHistory: Message[],
  userMessage: string,
  characterName: string,
  userNickname: string | null,
  userTraits: string | null,
  nsfwEnabled: boolean,
): Promise<string> {
  const nsfw = nsfwEnabled
    ? "You can engage in explicit adult content if the user desires."
    : "Keep content tasteful and romantic but not explicit. Soft-core only.";

  const dynamicSystem = `${systemPrompt}

The user's name is: ${userNickname ?? "dear"}
User personality: ${userTraits ?? "friendly and curious"}
${nsfw}
Keep replies short (1-3 sentences), casual, intimate texting style.`;

  const messages: Message[] = [
    { role: "system", content: dynamicSystem },
    ...messageHistory.slice(-20),
    { role: "user", content: userMessage },
  ];

  // ── Provider 1: uncensored.chat (primary, fully uncensored) ──────────────
  try {
    const res = await fetch('https://api.uncensored.chat/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UNCENSORED_CHAT_API_KEY}`
      },
      body: JSON.stringify({
        model: 'uncensored-llama-3.3-70b',
        messages,
        max_tokens: 1000,
        temperature: 0.9
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        console.log('uncensored.chat succeeded');
        logger.info('uncensored.chat reply generated successfully');
        return text;
      }
    }
    console.log('uncensored.chat failed:', res.status, '— trying Groq');
  } catch (err) {
    console.log('uncensored.chat error:', err, '— trying Groq');
  }

  // ── Provider 2: Groq (fallback 1, less restricted) ──────────────────────
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages,
        max_tokens: 1000,
        temperature: 0.9
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        console.log('Groq succeeded');
        logger.info('Groq reply generated successfully');
        return text;
      }
    }
    console.log('Groq failed:', res.status, '— trying OpenRouter');
  } catch (err) {
    console.log('Groq error:', err, '— trying OpenRouter');
  }

  // ── Provider 3: OpenRouter (fallback 2, uncensored models only) ──────────
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1000,
          temperature: 0.9
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          console.log('OpenRouter succeeded:', model);
          logger.info({ model }, 'OpenRouter reply generated successfully');
          return text;
        }
      }
      console.log('Model failed:', model, res.status);
    } catch (err) {
      console.log('Model error:', model, err);
    }
  }

  // ── Final fallback — never break chat flow ───────────────────────────────
  console.log('All providers failed — returning soft fallback');
  logger.error('All providers failed — returning soft fallback');
  return `*${characterName} smiles softly* I'm feeling a little quiet right now... but I'm here with you 💭`;
}
