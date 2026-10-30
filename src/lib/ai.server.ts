// Server-only: AI calls with strict structured output.
// Uses GEMINI_API_KEY (default) or OPENAI_API_KEY.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, generateText } from "ai";
import type { z } from "zod";

const GEMINI_MODEL = process.env["GEMINI_MODEL"] || "gemini-3.5-flash-lite";

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function friendlyAiError(e: unknown): AiError {
  const status = (e as { statusCode?: number })?.statusCode ?? 500;
  if (status === 402) return new AiError("AI quota exceeded. Please check your API key credits.", 402);
  if (status === 429) return new AiError("The AI is busy right now. Try again in a minute.", 429);
  if (status === 403) return new AiError("AI access is forbidden with provided credentials.", 403);
  return new AiError("The AI request failed. Try again.", status);
}

export async function generateStructured<T>(opts: {
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];

  if (!geminiKey && !openaiKey) {
    throw new AiError(
      "AI is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to your .env file.",
      500,
    );
  }

  let model;

  if (geminiKey) {
    const provider = createGoogleGenerativeAI({ apiKey: geminiKey });
    model = provider(GEMINI_MODEL);
  } else {
    const provider = createOpenAI({ apiKey: openaiKey! });
    model = provider("gpt-4o-mini");
  }

  try {
    const result = await generateText({
      model,
      system: opts.instructions,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      maxRetries: 2,
    });
    return result.output as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      if (e.text) {
        try {
          return opts.schema.parse(JSON.parse(e.text));
        } catch {
          /* fall through */
        }
      }
      throw new AiError("The AI returned an unexpected answer. Try again.", 502);
    }
    console.error("AI call failed:", e instanceof Error ? e.message : "unknown");
    throw friendlyAiError(e);
  }
}
