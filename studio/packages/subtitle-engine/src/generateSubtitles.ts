import type { Subtitle, WordTiming } from "@sarkaritaayari/shared";

export interface GenerateSubtitlesOptions {
  /** Added to every cue's start/end — use this to line cues up with an audio lead-in. */
  offsetSeconds?: number;
  /** Soft cap on characters per cue, for mobile readability. */
  maxCharsPerCue?: number;
  /** Cues won't be shorter than this unless the clip itself is shorter. */
  minCueSeconds?: number;
  /**
   * Word-level alignment from the TTS provider, if it has any (most don't).
   * When present, cue timing comes directly from these instead of the
   * character-count heuristic, which is significantly more accurate.
   */
  wordTimings?: WordTiming[];
}

const DEFAULT_MAX_CHARS_PER_CUE = 55;
const DEFAULT_MIN_CUE_SECONDS = 0.9;

/**
 * Scans forward for sentence-ending punctuation and slices the *original*
 * string between boundaries, so trailing closing quotes/brackets after a
 * period (e.g. `per hundred."`) can never cause characters to be silently
 * dropped — a match-based split previously lost whole clauses whenever a
 * sentence ended inside a quotation.
 */
function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentenceEndPattern = /[.!?]+[)\]"'”’]*(?=\s|$)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndPattern.exec(trimmed)) !== null) {
    const end = match.index + match[0].length;
    sentences.push(trimmed.slice(lastIndex, end).trim());
    lastIndex = end;
  }
  if (lastIndex < trimmed.length) {
    sentences.push(trimmed.slice(lastIndex).trim());
  }

  return sentences.filter(Boolean);
}

function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const words = sentence.split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function generateFromWordTimings(wordTimings: WordTiming[], maxCharsPerCue: number, offsetSeconds: number): Subtitle[] {
  const cues: Subtitle[] = [];
  let currentWords: WordTiming[] = [];
  let currentLength = 0;

  const flush = () => {
    if (currentWords.length === 0) return;
    cues.push({
      text: currentWords.map((w) => w.word).join(" "),
      start: currentWords[0].start + offsetSeconds,
      end: currentWords[currentWords.length - 1].end + offsetSeconds,
    });
    currentWords = [];
    currentLength = 0;
  };

  for (const wt of wordTimings) {
    const nextLength = currentLength + wt.word.length + 1;
    if (nextLength > maxCharsPerCue && currentWords.length > 0) {
      flush();
    }
    currentWords.push(wt);
    currentLength += wt.word.length + 1;
  }
  flush();

  return cues;
}

/**
 * Heuristic fallback used when the TTS provider gives us only a total
 * duration (true of most providers, including OpenAI's). Splits narration
 * into readable chunks and distributes the known audio duration across them
 * proportionally by character count. This is an approximation, not true
 * word-level alignment — good enough for phrase-level sync, and the first
 * thing to upgrade if a provider with word timings gets added later.
 */
function generateFromDuration(
  narration: string,
  durationInSeconds: number,
  maxCharsPerCue: number,
  minCueSeconds: number,
  offsetSeconds: number
): Subtitle[] {
  const chunks = splitIntoSentences(narration).flatMap((s) => splitLongSentence(s, maxCharsPerCue));
  if (chunks.length === 0) return [];

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
  const rawDurations = chunks.map((c) => (durationInSeconds * c.length) / totalChars);

  // Floor every cue (including the last) to at least minCueSeconds so no cue
  // — especially a short trailing fragment like "lesson." — ends up as an
  // unreadable flash. If that floor makes the cues not fit, scale all of
  // them down together rather than letting one cue eat the overflow.
  const flooredDurations = rawDurations.map((d) => Math.min(Math.max(d, minCueSeconds), durationInSeconds));
  const flooredTotal = flooredDurations.reduce((sum, d) => sum + d, 0);
  const scale = flooredTotal > durationInSeconds ? durationInSeconds / flooredTotal : 1;

  const cues: Subtitle[] = [];
  let cursor = 0;

  chunks.forEach((chunk, i) => {
    const isLast = i === chunks.length - 1;
    const start = cursor;
    const end = isLast ? durationInSeconds : cursor + flooredDurations[i] * scale;
    cursor = end;

    cues.push({ text: chunk, start: start + offsetSeconds, end: end + offsetSeconds });
  });

  return cues;
}

export function generateSubtitles(
  narration: string,
  durationInSeconds: number,
  options: GenerateSubtitlesOptions = {}
): Subtitle[] {
  const maxCharsPerCue = options.maxCharsPerCue ?? DEFAULT_MAX_CHARS_PER_CUE;
  const minCueSeconds = options.minCueSeconds ?? DEFAULT_MIN_CUE_SECONDS;
  const offsetSeconds = options.offsetSeconds ?? 0;

  if (options.wordTimings && options.wordTimings.length > 0) {
    return generateFromWordTimings(options.wordTimings, maxCharsPerCue, offsetSeconds);
  }

  return generateFromDuration(narration, durationInSeconds, maxCharsPerCue, minCueSeconds, offsetSeconds);
}
