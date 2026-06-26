import { logger } from "./logger";

const PRIMARY_MODEL = "mistralai/mistral-7b-instruct";
const FALLBACK_MODELS = [
  "nousresearch/nous-capybara-7b",
  "openchat/openchat-7b",
  "gryphe/mythomist-7b",
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

async function callModel(model: string, messages: Message[]): Promise<string> {
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
    let bodyText = "";
    try { bodyText = await response.text(); } catch { /* ignore */ }
    console.error(`OpenRouter HTTP error: model=${model} status=${status} body=${bodyText}`);
    logger.warn({ model, status, body: bodyText }, "OpenRouter HTTP error");
    throw new Error(`OpenRouter ${status}: ${bodyText.slice(0, 200)}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logger.warn({ model, data }, "OpenRouter returned empty content");
    throw new Error("Empty response from model");
  }
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

  const allModels = [PRIMARY_MODEL, ...FALLBACK_MODELS];

  for (const model of allModels) {
    try {
      const reply = await callModel(model, messages);
      logger.info({ model }, "OpenRouter reply generated successfully");
      return reply;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err, model }, "Model failed, trying next");
    }
  }

  logger.error("All OpenRouter models failed — returning soft fallback");
  return `*${characterName} smiles softly* I'm feeling a little quiet right now... but I'm here with you 💭`;
}
