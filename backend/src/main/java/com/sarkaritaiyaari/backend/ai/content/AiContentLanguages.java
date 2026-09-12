package com.sarkaritaiyaari.backend.ai.content;

import java.util.Map;
import java.util.Set;

/**
 * TASK-2701 Phase 2 -- mirrors {@code AI_LANGUAGES} in {@code packages/core/src/ai/tasks.ts}.
 * Only English and Hindi have real question content anywhere in this app
 * ({@code mobile/src/practice/appLanguage.tsx} calls its own eleven-language picker a mock);
 * generating for anything else means the model would have to translate the question first,
 * which is the fabrication risk this whole pipeline exists to avoid (decision 3,
 * {@code AI_ARCHITECTURE.md} §13). Revisit only when real Telugu question content is authored.
 */
public final class AiContentLanguages {

    public static final Set<String> SUPPORTED = Set.of("en", "hi");

    private static final Map<String, String> DISPLAY_NAMES = Map.of("en", "English", "hi", "Hindi");

    private AiContentLanguages() {
    }

    public static boolean isSupported(String languageCode) {
        return languageCode != null && SUPPORTED.contains(languageCode);
    }

    public static String displayName(String languageCode) {
        return DISPLAY_NAMES.getOrDefault(languageCode, languageCode);
    }
}
