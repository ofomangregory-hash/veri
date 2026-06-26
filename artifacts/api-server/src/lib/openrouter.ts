import { logger } from "./logger";

const FREE_MODELS = [
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "venice/uncensored:free",
  "nousresearch/hermes-3-llama-3.1-8b:free",
  "openrouter/free",
];

// Log API key presence on startup (never log the actual key)
console.log(`OpenRouter API key: ${process.env.OPENROUTER_API_KEY ? "present" : "missing"}`);

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

async function callOpenRouter(model: string, messages: Message[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set — add it to Replit Secrets");

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
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const status = response.status;
    console.log("Model failed:", model, status);
    logger.warn({ model, status }, "OpenRouter HTTP error");
    throw new Error(`OpenRouter ${status}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.log("Model failed:", model, "empty response");
    logger.warn({ model }, "OpenRouter returned empty content");
    throw new Error("Empty response from model");
  }

  console.log("Model succeeded:", model);
  return content;
}

async function callUncensoredChat(messages: Message[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  console.log("Falling back to uncensored.chat");
  logger.info("All OpenRouter models failed — trying uncensored.chat");

  const response = await fetch("https://api.uncensored.chat/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "uncensored-llama-3.3-70b",
      messages,
      max_tokens: 140,
      temperature: 0.88,
      top_p: 0.9,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const status = response.status;
    console.log("uncensored.chat failed:", status);
    throw new Error(`uncensored.chat ${status}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from uncensored.chat");

  console.log("Model succeeded: uncensored.chat");
  return content;
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

  // Try all OpenRouter free models in order; on 404/5xx move to next immediately
  for (const model of FREE_MODELS) {
    try {
      const reply = await callOpenRouter(model, messages);
      logger.info({ model }, "OpenRouter reply generated successfully");
      return reply;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err, model }, "Model failed, trying next");
    }
  }

  // All OpenRouter models failed — retry once against uncensored.chat
  try {
    const reply = await callUncensoredChat(messages);
    logger.info("uncensored.chat reply generated successfully");
    return reply;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "uncensored.chat also failed");
  }

  // Soft fallback — never break chat flow
  logger.error("All models failed — returning soft fallback");
  return `*${characterName} smiles softly* I'm feeling a little quiet right now... but I'm here with you 💭`;
}
