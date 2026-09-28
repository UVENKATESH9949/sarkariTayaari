import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TTSProvider, TTSRequest, TTSResult } from "../types";
import { getAudioDuration } from "../audio/getAudioDuration";

export interface LocalSapiTTSProviderConfig {
  /** Installed Windows SAPI voice name, e.g. "Microsoft Zira Desktop". Defaults to the system voice. */
  voice?: string;
  /** SAPI rate, -10 (slowest) to 10 (fastest). */
  rate?: number;
}

const escapeForSingleQuotedPowerShell = (value: string): string => value.replace(/'/g, "''");

/**
 * Local, no-API-key provider using Windows' built-in SAPI voices (via
 * System.Speech in PowerShell). Voice quality is noticeably more robotic
 * than a cloud provider — this exists to prove TTSProvider swaps cleanly
 * and to unblock pipeline testing without network access, not as the
 * provider for a final quality pass.
 */
export class LocalSapiTTSProvider implements TTSProvider {
  readonly name = "local-sapi";
  private readonly voice?: string;
  private readonly rate: number;

  constructor(config: LocalSapiTTSProviderConfig = {}) {
    this.voice = config.voice;
    this.rate = config.rate ?? 0;
  }

  async synthesize(request: TTSRequest, outputPath: string): Promise<TTSResult> {
    const textFile = path.join(tmpdir(), `narration-${randomUUID()}.txt`);
    await writeFile(textFile, request.text, "utf8");

    const voiceLine = this.voice
      ? `$synth.SelectVoice('${escapeForSingleQuotedPowerShell(this.voice)}')`
      : "";

    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      voiceLine,
      `$synth.Rate = ${this.rate}`,
      `$synth.SetOutputToWaveFile('${escapeForSingleQuotedPowerShell(outputPath)}')`,
      `$text = Get-Content -Raw -Path '${escapeForSingleQuotedPowerShell(textFile)}'`,
      "$synth.Speak($text)",
      "$synth.Dispose()",
    ].join("\n");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Local SAPI synthesis failed (exit ${code}): ${stderr}`));
      });
    });

    await unlink(textFile).catch(() => {});

    const durationInSeconds = await getAudioDuration(outputPath);
    return { audioFilePath: outputPath, durationInSeconds };
  }
}
