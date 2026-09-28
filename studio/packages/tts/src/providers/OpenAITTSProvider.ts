import { writeFile } from "node:fs/promises";
import type { TTSProvider, TTSRequest, TTSResult } from "../types";
import { getAudioDuration } from "../audio/getAudioDuration";

export interface OpenAITTSProviderConfig {
  apiKey: string;
  /** OpenAI TTS model id. */
  model?: string;
  defaultVoice?: string;
}

/** Cloud provider. Swappable — everything upstream only depends on TTSProvider. */
export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly defaultVoice: string;

  constructor(config: OpenAITTSProviderConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAITTSProvider requires an apiKey (set OPENAI_API_KEY).");
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-4o-mini-tts";
    this.defaultVoice = config.defaultVoice ?? "alloy";
  }

  async synthesize(request: TTSRequest, outputPath: string): Promise<TTSResult> {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        voice: request.voice ?? this.defaultVoice,
        input: request.text,
        response_format: "mp3",
        speed: request.speed ?? 1.0,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI TTS request failed (${response.status}): ${body}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, buffer);

    const durationInSeconds = await getAudioDuration(outputPath);
    return { audioFilePath: outputPath, durationInSeconds };
  }
}
