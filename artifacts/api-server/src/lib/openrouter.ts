import { logger } from "./logger";

const PRIMARY_MODEL = "mistralai/mistral-7b-instruct:free";
const FALLBACK_MODELS = [
  "google/gemma-3-1b-it:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
];

interface Message {
  role: string;
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

async function callModel(model: string, messages: Message[], nsfwEnabled: boolean): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://z-fantasy.replit.app",
      "X-Title": "Z-Fantasy",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 140,
      temperature: 0.88,
      top_p: 0.9,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 503) {
      throw { retryable: true, status };
    }
    throw new Error(`OpenRouter error: ${status}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  return data.choices?.[0]?.message?.content ?? "...";
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

  // Try primary model first
  try {
    return await callModel(PRIMARY_MODEL, messages, nsfwEnabled);
  } catch (err: unknown) {
    const retryable = typeof err === "object" && err !== null && "retryable" in err;
    if (!retryable) throw err;
    logger.warn({ err }, "Primary model failed, trying fallbacks");
  }

  // Try fallbacks sequentially
  for (const model of FALLBACK_MODELS) {
    try {
      return await callModel(model, messages, nsfwEnabled);
    } catch (err) {
      logger.warn({ err, model }, "Fallback model failed");
    }
  }

  return "I'm feeling a little overwhelmed right now... give me a moment?";
}
