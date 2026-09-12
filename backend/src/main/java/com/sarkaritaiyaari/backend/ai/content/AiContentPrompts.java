package com.sarkaritaiyaari.backend.ai.content;

import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.content.AiContentContextLoader.QuestionPromptContext;
import com.sarkaritaiyaari.backend.ai.content.AiContentContextLoader.TopicPromptContext;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * TASK-2701 Phase 2 -- versioned prompt templates. Bumping {@link #PROMPT_VERSION} is how a
 * changed prompt becomes a new generation rather than silently altering rows already published:
 * {@code ai_content.prompt_version} is part of a row's identity (see V41's own comment), so a
 * regeneration under a new version creates a new DRAFT candidate instead of overwriting a
 * PUBLISHED one. A prompt change is therefore always reviewed again before it reaches a student.
 *
 * Takes {@link AiContentContextLoader}'s plain record types, never an entity — those records are
 * the whole reason a lazy {@code Question.getTopic().getSubject()} navigation can't leak past
 * its own transaction (see that class's own comment).
 *
 * Every instruction here follows AI_ARCHITECTURE.md §8: the verified answer is supplied as
 * given, the model is asked to explain it, never to choose it.
 */
public final class AiContentPrompts {

    public static final String PROMPT_VERSION = "AI_CONTENT_V1";

    private static final String QUESTION_EXPLANATION_SYSTEM = """
            You write explanations for a multiple-choice question in an Indian government exam \
            preparation app. You are told the verified correct answer -- never guess or second-guess it.

            Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence:
            {
              "answer": "<echo the verified correct answer exactly as given>",
              "whyCorrect": "<why this answer is correct, 2-4 sentences>",
              "whyOthersWrong": [{"option": "<option text>", "why": "<one sentence>"}, ...],
              "concept": "<the underlying concept in a few words, or null>",
              "examTip": "<a short, concrete exam tip, or null>"
            }

            Rules:
            - "answer" MUST equal the verified correct answer given to you. Never substitute a different one.
            - Cover every wrong option in "whyOthersWrong", using the option text exactly as given.
            - Keep the whole response concise -- this is read on a phone between practice questions.
            - Write only in the requested language.""";

    private static final String CONCEPT_EXPLANATION_SYSTEM = """
            You write a short concept explanation for a topic in an Indian government exam preparation app.

            Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence:
            {
              "concept": "<the concept name>",
              "explanation": "<a clear explanation a student revising for an exam can act on, 3-6 sentences>",
              "examTip": "<a short, concrete exam tip, or null>"
            }

            Rules:
            - Do not invent facts, dates, or rules specific to any single exam's notification -- \
            those come from verified exam-guide data elsewhere in this app, not from you.
            - Write only in the requested language.""";

    private AiContentPrompts() {
    }

    public static AIMessage questionExplanationUserMessage(QuestionPromptContext question, String languageName) {
        List<String> options = question.options();
        String optionLines = IntStream.range(0, options.size())
                .mapToObj(i -> letterFor(i) + ") " + options.get(i))
                .collect(Collectors.joining("\n"));

        String prompt = """
                Language: %s
                Subject: %s
                Topic: %s
                Question: %s

                Options:
                %s

                Verified correct answer (do not change this): %s""".formatted(
                languageName,
                question.subjectName(),
                question.topicName(),
                question.questionText(),
                optionLines,
                question.correctAnswer());

        return AIMessage.user(prompt);
    }

    public static AIMessage conceptExplanationUserMessage(TopicPromptContext topic, String languageName) {
        String prompt = """
                Language: %s
                Subject: %s
                Topic: %s""".formatted(languageName, topic.subjectName(), topic.topicName());

        return AIMessage.user(prompt);
    }

    public static String questionExplanationSystemPrompt() {
        return QUESTION_EXPLANATION_SYSTEM;
    }

    public static String conceptExplanationSystemPrompt() {
        return CONCEPT_EXPLANATION_SYSTEM;
    }

    private static String letterFor(int index) {
        return String.valueOf((char) ('A' + index));
    }
}
