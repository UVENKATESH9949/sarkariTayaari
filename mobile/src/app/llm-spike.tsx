import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { initLlama, type LlamaContext } from "llama.rn";

/**
 * THROWAWAY on-device feasibility spike -- not part of the shipped app, not reachable from any
 * tab/nav, and not intended to be committed long-term. Reached only via a direct deep link
 * (`sarkaritaiyaari:///llm-spike`).
 *
 * The question: can a small (~1B parameter) quantized LLM run acceptably -- load, generate,
 * without crashing -- on old, low-RAM (4GB) Android hardware, using the exact same "give it the
 * verified answer, ask it to explain" grounding technique the cloud pipeline already uses
 * (see backend/.../ai/content/AiContentPrompts.java). If this works, on-device inference becomes
 * viable for the tasks that need a live per-student answer (mistake analysis, study plan) without
 * a recurring cloud API cost; if not, cloud stays the answer for this device class.
 *
 * Model: Llama-3.2-1B-Instruct, Q4_K_M quantization (~808MB), from a verified real source --
 * https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF -- downloaded once into the app's
 * document directory (never bundled into the app itself; a model this size has no business in an
 * APK, same reasoning as this project's existing question-media pre-download).
 */

const MODEL_URL =
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf";
const MODEL_FILENAME = "llama-3.2-1b-instruct-q4_k_m.gguf";

const modelDir = new Directory(Paths.document, "llm-spike");

// A real SSC-CGL-style aptitude question -- picked to actually exercise multi-step reasoning,
// not just recall, since that's the harder case for a 1B model.
const SAMPLE_QUESTION = {
  subject: "Quantitative Aptitude",
  topic: "Profit & Loss",
  text:
    "A shopkeeper marks up an item's price by 25% above cost price, then offers a 10% discount " +
    "on the marked price. What is the shopkeeper's overall profit percentage?",
  options: ["10%", "12.5%", "15%", "20%"],
  correctAnswer: "B) 12.5%",
};

const SYSTEM_PROMPT =
  "You write explanations for a multiple-choice question in an Indian government exam " +
  "preparation app. You are told the verified correct answer -- never guess or second-guess it. " +
  "Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence: " +
  '{"answer": "<echo the verified correct answer exactly as given>", ' +
  '"whyCorrect": "<why this answer is correct, 2-4 sentences>", ' +
  '"examTip": "<a short, concrete exam tip>"}. ' +
  "Rules: \"answer\" MUST equal the verified correct answer given to you. Keep the whole response " +
  "concise -- this is read on a phone between practice questions.";

function buildUserPrompt(): string {
  const optionLines = SAMPLE_QUESTION.options
    .map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`)
    .join("\n");
  return (
    `Subject: ${SAMPLE_QUESTION.subject}\nTopic: ${SAMPLE_QUESTION.topic}\n` +
    `Question: ${SAMPLE_QUESTION.text}\n\nOptions:\n${optionLines}\n\n` +
    `Verified correct answer (do not change this): ${SAMPLE_QUESTION.correctAnswer}`
  );
}

type Phase = "idle" | "downloading" | "downloaded" | "loading" | "loaded" | "generating" | "done" | "error";

export default function LlmSpikeScreen() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ bytesWritten: number; totalBytes: number } | null>(null);
  const [context, setContext] = useState<LlamaContext | null>(null);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    downloadMs?: number;
    loadMs?: number;
    firstTokenMs?: number;
    totalGenMs?: number;
    tokenCount?: number;
  }>({});

  function existingModelFile(): File | null {
    if (!modelDir.exists) return null;
    const file = new File(modelDir, MODEL_FILENAME);
    return file.exists ? file : null;
  }

  async function handleDownload() {
    setErrorMessage(null);
    try {
      const already = existingModelFile();
      if (already) {
        setModelPath(already.uri);
        setPhase("downloaded");
        return;
      }
      if (!modelDir.exists) modelDir.create({ intermediates: true, idempotent: true });
      setPhase("downloading");
      const start = Date.now();
      const destination = new File(modelDir, MODEL_FILENAME);
      const downloaded = await File.downloadFileAsync(MODEL_URL, destination, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => setProgress({ bytesWritten, totalBytes }),
      });
      setMetrics((m) => ({ ...m, downloadMs: Date.now() - start }));
      setModelPath(downloaded.uri);
      setPhase("downloaded");
    } catch (err) {
      setErrorMessage(String(err));
      setPhase("error");
    }
  }

  async function handleLoad() {
    if (!modelPath) return;
    setErrorMessage(null);
    setPhase("loading");
    try {
      const start = Date.now();
      // n_gpu_layers: 0 -- deliberate CPU-only baseline. This is old, low-end hardware with no
      // confirmed GPU/NPU delegate support; CPU is the realistic floor this spike measures.
      const ctx = await initLlama({ model: modelPath, n_ctx: 2048, n_gpu_layers: 0 });
      setMetrics((m) => ({ ...m, loadMs: Date.now() - start }));
      setContext(ctx);
      setPhase("loaded");
    } catch (err) {
      setErrorMessage(String(err));
      setPhase("error");
    }
  }

  async function handleGenerate() {
    if (!context) return;
    setErrorMessage(null);
    setOutput("");
    setPhase("generating");
    let firstTokenAt: number | null = null;
    let tokenCount = 0;
    const start = Date.now();
    try {
      const result = await context.completion(
        {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt() },
          ],
          n_predict: 300,
        },
        (data) => {
          if (firstTokenAt === null) {
            firstTokenAt = Date.now();
            setMetrics((m) => ({ ...m, firstTokenMs: firstTokenAt! - start }));
          }
          tokenCount += 1;
          setOutput((prev) => prev + data.token);
        },
      );
      setMetrics((m) => ({ ...m, totalGenMs: Date.now() - start, tokenCount }));
      if (!output) setOutput(result.text);
      setPhase("done");
    } catch (err) {
      setErrorMessage(String(err));
      setPhase("error");
    }
  }

  async function handleRelease() {
    if (!context) return;
    await context.release();
    setContext(null);
    setPhase("downloaded");
  }

  const tokensPerSec =
    metrics.totalGenMs && metrics.tokenCount ? (metrics.tokenCount / (metrics.totalGenMs / 1000)).toFixed(2) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>On-device LLM spike (throwaway)</Text>
      <Text style={styles.subtitle}>Llama-3.2-1B-Instruct, Q4_K_M, CPU-only</Text>

      <View style={styles.row}>
        <Pressable style={styles.button} onPress={handleDownload} disabled={phase === "downloading"}>
          <Text style={styles.buttonText}>1. Download model</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={handleLoad}
          disabled={!modelPath || phase === "loading" || phase === "loaded" || phase === "generating"}
        >
          <Text style={styles.buttonText}>2. Load model</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={handleGenerate} disabled={!context || phase === "generating"}>
          <Text style={styles.buttonText}>3. Generate explanation</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={handleRelease} disabled={!context}>
          <Text style={styles.buttonText}>Release model</Text>
        </Pressable>
      </View>

      {phase === "downloading" && progress && (
        <View style={styles.section}>
          <ActivityIndicator />
          <Text>
            Downloading: {(progress.bytesWritten / 1024 / 1024).toFixed(0)}MB /{" "}
            {(progress.totalBytes / 1024 / 1024).toFixed(0)}MB
          </Text>
        </View>
      )}
      {phase === "loading" && (
        <View style={styles.section}>
          <ActivityIndicator />
          <Text>Loading model into memory...</Text>
        </View>
      )}
      {phase === "generating" && (
        <View style={styles.section}>
          <ActivityIndicator />
          <Text>Generating...</Text>
        </View>
      )}
      {errorMessage && (
        <View style={styles.section}>
          <Text style={styles.error}>Error: {errorMessage}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Metrics</Text>
        <Text>Phase: {phase}</Text>
        {metrics.downloadMs != null && <Text>Download time: {(metrics.downloadMs / 1000).toFixed(1)}s</Text>}
        {metrics.loadMs != null && <Text>Model load time: {(metrics.loadMs / 1000).toFixed(1)}s</Text>}
        {metrics.firstTokenMs != null && (
          <Text>Time to first token: {(metrics.firstTokenMs / 1000).toFixed(1)}s</Text>
        )}
        {metrics.totalGenMs != null && (
          <Text>Total generation time: {(metrics.totalGenMs / 1000).toFixed(1)}s</Text>
        )}
        {metrics.tokenCount != null && <Text>Tokens generated: {metrics.tokenCount}</Text>}
        {tokensPerSec && <Text>Tokens/sec: {tokensPerSec}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Prompt sent</Text>
        <Text style={styles.mono}>{buildUserPrompt()}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Model output (judge quality yourself)</Text>
        <Text style={styles.mono}>{output || "(nothing yet)"}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 13, color: "#666" },
  row: { flexDirection: "row", gap: 8 },
  button: { flex: 1, backgroundColor: "#208AEF", borderRadius: 8, padding: 12, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 13 },
  section: { gap: 4, borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 12 },
  label: { fontWeight: "700" },
  error: { color: "#c00" },
  mono: { fontFamily: "monospace", fontSize: 12 },
});
