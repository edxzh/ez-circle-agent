import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import { z } from "zod";
import type { WalletService } from "../wallet/types.js";
import { buildWalletToolSpecs, type WalletToolSpec } from "../tools/walletToolSpecs.js";
import { AGENT_SYSTEM_PROMPT } from "./systemPrompt.js";
import type { SummarizeRequest, SummarizeResult, Summarizer } from "../server/summarizer.js";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_TOOL_ITERATIONS = 10;

/** Minimal client surface — injectable for offline tests. */
export interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  };
}

export interface GeminiAgentOptions {
  apiKey?: string;
  model?: string;
  /** Test seam: replaces the real GoogleGenAI client. */
  client?: GeminiClient;
}

function makeClient(apiKey?: string): GeminiClient {
  // Falls back to GEMINI_API_KEY / GOOGLE_API_KEY env vars when not passed.
  return new GoogleGenAI(apiKey ? { apiKey } : {});
}

/** Converts a neutral wallet tool spec to a Gemini function declaration. */
export function toFunctionDeclaration(spec: WalletToolSpec): FunctionDeclaration {
  const declaration: FunctionDeclaration = {
    name: spec.name,
    description: spec.description,
  };
  const jsonSchema = z.toJSONSchema(spec.inputSchema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  // Gemini allows omitting the schema for parameterless functions.
  const properties = jsonSchema.properties as Record<string, unknown> | undefined;
  if (properties && Object.keys(properties).length > 0) {
    declaration.parametersJsonSchema = jsonSchema;
  }
  return declaration;
}

/**
 * One agent turn via the Google Gen AI SDK: manual function-calling loop —
 * model requests wallet tools, we execute them (guardrail included) and
 * feed results back until the model produces a final text answer.
 */
export async function runGeminiAgent(
  userMessage: string,
  wallet: WalletService,
  options: GeminiAgentOptions = {},
): Promise<string> {
  const client = options.client ?? makeClient(options.apiKey);
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const specs = buildWalletToolSpecs(wallet);
  const functionDeclarations = specs.map(toFunctionDeclaration);

  const contents: Content[] = [{ role: "user", parts: [{ text: userMessage }] }];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: AGENT_SYSTEM_PROMPT,
        tools: [{ functionDeclarations }],
      },
    });

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      return response.text ?? "";
    }

    // Echo the model turn, then answer every function call in one user turn.
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const responseParts: Part[] = [];
    for (const call of calls) {
      const spec = specs.find((s) => s.name === call.name);
      const result = spec
        ? await spec.execute((call.args ?? {}) as Record<string, unknown>)
        : JSON.stringify({ error: `Unknown tool: ${call.name}` });
      responseParts.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name ?? "unknown",
          response: { result },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  throw new Error(`Agent exceeded ${MAX_TOOL_ITERATIONS} tool iterations without a final answer.`);
}

const SUMMARIZER_SYSTEM_PROMPT =
  "You are a premium text-summarization service. Produce a faithful, concise summary of the user's text. " +
  "Respond with the summary only — no preamble, no meta-commentary.";

/** Summarizer backed by the Google Gen AI SDK (for the x402 paid API). */
export class GeminiSummarizer implements Summarizer {
  private client: GeminiClient;

  constructor(
    apiKey?: string,
    private readonly model = DEFAULT_GEMINI_MODEL,
    client?: GeminiClient,
  ) {
    this.client = client ?? makeClient(apiKey);
  }

  async summarize({ text, style }: SummarizeRequest): Promise<SummarizeResult> {
    const instruction = style
      ? `Summarize the following text (${style}):\n\n${text}`
      : `Summarize the following text:\n\n${text}`;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      config: { systemInstruction: SUMMARIZER_SYSTEM_PROMPT },
    });

    return {
      summary: (response.text ?? "").trim(),
      model: response.modelVersion ?? this.model,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
