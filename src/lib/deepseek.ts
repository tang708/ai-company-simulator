import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

export async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
  options?: {
    temperature?: number;
    model?: string;
    maxTokens?: number;
  }
): Promise<string> {
  const response = await deepseek.chat.completions.create({
    model: options?.model || DEFAULT_MODEL,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: false,
  });

  return response.choices[0]?.message?.content || "";
}

export async function chatCompletionWithHistory(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: {
    temperature?: number;
    model?: string;
    maxTokens?: number;
  }
): Promise<string> {
  const response = await deepseek.chat.completions.create({
    model: options?.model || DEFAULT_MODEL,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    messages,
    stream: false,
  });

  return response.choices[0]?.message?.content || "";
}

export default deepseek;
