import Anthropic from "@anthropic-ai/sdk";

export interface SummarizeRequest {
  text: string;
  /** Optional style hint, e.g. "bullet points" or "one sentence". */
  style?: string;
}

export interface SummarizeResult {
  summary: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Summarizer {
  summarize(request: SummarizeRequest): Promise<SummarizeResult>;
}

const SYSTEM_PROMPT =
  "You are a premium text-summarization service. Produce a faithful, concise summary of the user's text. " +
  "Respond with the summary only — no preamble, no meta-commentary.";

/** Live summarizer backed by the Anthropic API. */
export class AnthropicSummarizer implements Summarizer {
  private client: Anthropic;

  constructor(
    apiKey?: string,
    private readonly model = "claude-opus-4-8",
  ) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async summarize({ text, style }: SummarizeRequest): Promise<SummarizeResult> {
    const instruction = style
      ? `Summarize the following text (${style}):\n\n${text}`
      : `Summarize the following text:\n\n${text}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: instruction }],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      summary,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
