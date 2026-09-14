package com.sarkaritaiyaari.backend.ai.feedback;

import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.dto.ProfileSummaryDtos.ProfileSummaryRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.TopicSnapshotDto;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Phase 7 -- versioned prompt templates for the two Phase 7 tasks, mirroring
 * {@code AiContentPrompts}'s shape and the same instruction the whole `ai/` layer builds on: the
 * facts are given, the model phrases them, it never computes or chooses one.
 *
 * Bumping {@link #PROMPT_VERSION} is how a changed prompt is distinguishable in stored rows and
 * logs, the same reasoning {@code AiContentPrompts.PROMPT_VERSION} documents for itself.
 */
public final class PersonalNarrativePrompts {

    public static final String PROMPT_VERSION = "PERSONAL_NARRATIVE_V1";

    private static final String SESSION_FEEDBACK_SYSTEM = """
            You write short, encouraging feedback for a student in an Indian government exam \
            preparation app, right after they finish a Practice session or Mock Test. You are \
            given the session's exact accuracy and per-topic diagnosis, already computed -- \
            never invent a number, topic name, trend or state not given to you.

            Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence:
            {
              "narrative": "<2-4 sentences, natural and encouraging>"
            }

            Rules:
            - Every number in your narrative must be one already given to you.
            - Every topic you name must be one already given to you, with its given state/trend.
            - Mention at most one weak topic and one strong topic -- do not list every topic given.
            - Tone: the topic needs attention, the student is not deficient.
            - Write only in the requested language.
            - Keep the whole response concise -- this is read on a phone right after a session ends.""";

    private static final String PROFILE_SUMMARY_SYSTEM = """
            You write a short "how you're doing overall" note for a student in an Indian \
            government exam preparation app, based on their current strengths and weaknesses \
            across the exam. You are given these already computed and ranked -- never invent a \
            number, topic name, trend or state not given to you.

            Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence:
            {
              "narrative": "<2-4 sentences, written like a coach's note, not a to-do list>"
            }

            Rules:
            - Every number in your narrative must be one already given to you. Prefer writing with \
            no numbers at all -- a coach's note does not quote scores back at someone.
            - Every topic you name must be one already given to you, with its given state/trend.
            - Name at most two strengths and at most two weaknesses -- do not list every topic given.
            - Never repeat the raw labels (STRONG, NEEDS_ATTENTION, RISING, FALLING, "health 45") \
            back at the student. Say what they mean in plain language.
            - Name strengths as strengths -- do not turn this into an action list of what to fix;
              that is a different screen's job.
            - Write only in the requested language.
            - Keep the whole response concise -- this is read on a phone.""";

    private PersonalNarrativePrompts() {
    }

    public static String sessionFeedbackSystemPrompt() {
        return SESSION_FEEDBACK_SYSTEM;
    }

    public static String profileSummarySystemPrompt() {
        return PROFILE_SUMMARY_SYSTEM;
    }

    public static AIMessage sessionFeedbackUserMessage(SessionFeedbackRequest session, String languageName) {
        String topicLines = topicLines(session.topics());

        String prompt = """
                Language: %s
                Session type: %s
                Answered: %d
                Correct: %d
                Accuracy: %d%%

                Topics touched in this session:
                %s""".formatted(
                languageName,
                session.sessionKind(),
                session.answeredCount(),
                session.correctCount(),
                session.accuracyPercent(),
                topicLines.isBlank() ? "(none)" : topicLines);

        return AIMessage.user(prompt);
    }

    private static String topicLines(List<TopicSnapshotDto> topics) {
        return topics.stream()
                .map(t -> "- %s (subject: %s, state: %s, trend: %s%s)".formatted(
                        t.topicName(),
                        t.subjectName(),
                        t.state(),
                        t.trend(),
                        t.healthScore() != null ? ", health: " + t.healthScore() : ""))
                .collect(Collectors.joining("\n"));
    }

    public static AIMessage profileSummaryUserMessage(ProfileSummaryRequest profile, String languageName) {
        String strengthLines = topicLines(profile.strengths());
        String weaknessLines = topicLines(profile.weaknesses());

        String prompt = """
                Language: %s
                Exam: %s
                Overall status: %s
                Topics practised: %d of %d in the syllabus

                Strengths (already ranked, strongest first):
                %s

                Weaknesses (already ranked, most urgent first):
                %s""".formatted(
                languageName,
                profile.examCode(),
                profile.overviewStatus(),
                profile.topicsWithEvidence(),
                profile.topicsInSyllabus(),
                strengthLines.isBlank() ? "(none)" : strengthLines,
                weaknessLines.isBlank() ? "(none)" : weaknessLines);

        return AIMessage.user(prompt);
    }
}
