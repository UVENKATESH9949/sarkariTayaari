package com.sarkaritaiyaari.backend.ai.feedback;

import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.dto.MistakeAnalysisDtos.MistakeAnalysisRequest;
import com.sarkaritaiyaari.backend.dto.PracticeResultInsightDtos.FlaggedQuestionDto;
import com.sarkaritaiyaari.backend.dto.PracticeResultInsightDtos.PracticeResultInsightRequest;
import com.sarkaritaiyaari.backend.dto.PracticeResultInsightDtos.SubtopicSnapshotDto;
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
            - Never repeat the raw labels (STRONG, NEEDS_ATTENTION, RISING, FALLING, "health 45") \
            back at the student. Say what they mean in plain language. The session's accuracy is the \
            one figure worth quoting -- a health score means nothing to someone who has never seen \
            how it is calculated.
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

    /**
     * Phase 7.4. The one Phase 7 prompt whose output is structured rather than a single
     * narrative, because the mistake taxonomy is what makes this useful: "you misread the
     * question" and "you have never learned this" call for different next steps, and a free-text
     * paragraph cannot be counted, filtered or acted on later.
     *
     * <p>The verified answer is supplied, never requested -- the same rule
     * {@code AiContentPrompts} states for {@code QUESTION_EXPLANATION}. The model's job here is
     * strictly to explain a gap between two answers it was handed, not to work out which is right.
     */
    private static final String MISTAKE_ANALYSIS_SYSTEM = """
            You explain to a student in an Indian government exam preparation app why they got \
            one specific question wrong. You are given the question, the verified correct answer, \
            and the answer they actually chose -- never work out the answer yourself, and never \
            contradict the correct answer you were given.

            Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence:
            {
              "mistakeType": "<exactly one of the allowed values>",
              "explanation": "<1-3 sentences on why this particular slip happened>",
              "suggestedAction": "<1-2 sentences, one concrete next step>"
            }

            Allowed mistakeType values, and nothing else:
            KNOWLEDGE_GAP, CONCEPT_CONFUSION, CALCULATION_ERROR, MISREADING, GUESSING, \
            TIME_PRESSURE, SIMILAR_OPTION_CONFUSION, MEMORY_FAILURE, REPEATED_MISTAKE

            Rules:
            - Choose REPEATED_MISTAKE only if you are explicitly told they have missed this \
            question before. If you are told it is the first time, you must not choose it.
            - Choose TIME_PRESSURE or GUESSING only if the facts given actually suggest it. When \
            nothing distinguishes them, prefer the plainer KNOWLEDGE_GAP over a flattering guess.
            - You may show the working for this question, including intermediate numbers you \
            calculate yourself -- that is the point of explaining the mistake.
            - Never state a statistic about the student's performance (an accuracy, a score, a \
            count of attempts). You have not been given any, so any figure like that would be \
            invented.
            - Address the student as "you". Describe the mistake, never the student -- \
            "this one is easy to misread", not "you are careless".
            - Do not restate the question or list the options back.
            - Write only in the requested language.
            - Keep it short: this is read on a phone, under a question they already know they got wrong.""";

    /**
     * The Practice Result screen's "AI Feedback" tab. The facts are the deterministic Analytics
     * tab's own output, already computed on-device — never invent a number, sub-topic name or
     * trend not given. The job here is interpretation: turn measured facts into a short verdict
     * and one next step, the same "facts given, model phrases them" rule every prompt in this
     * file follows.
     */
    private static final String PRACTICE_RESULT_INSIGHT_SYSTEM = """
            You interpret a just-finished Practice session's already-computed performance data \
            for a student in an Indian government exam preparation app. You are given the exact \
            accuracy, per-sub-topic breakdown and time patterns already measured -- never invent a \
            number, sub-topic name, or previous-session trend not given to you.

            Return ONLY a JSON object with this exact shape, no prose outside the JSON, no markdown fence:
            {
              "summary": "<one concise paragraph interpreting the overall performance>",
              "strengths": ["<short point>", "..."],
              "weakAreas": ["<short point>", "..."],
              "timeInsight": "<one sentence, or null if time data reveals nothing meaningful>",
              "recommendation": "<one clear, concrete next step>",
              "recommendedAction": "<exactly one of RETRY, NEXT_LEVEL, NEXT_TOPIC, PRACTICE_WEAK_AREA>"
            }

            Rules:
            - Every sub-topic name you mention must be one already given to you.
            - "strengths" is 0-3 short points; "weakAreas" is 0-3 short points. Leave either empty \
            (an empty array) rather than inventing one when nothing genuinely stood out.
            - "timeInsight" must be null unless the given high-time or fast-accurate data actually \
            shows something worth saying -- never a filler sentence like "you answered at a normal pace."
            - "recommendation" may propose a practice amount (e.g. "10-15 questions") as a concrete \
            suggestion -- that is an action item, not a claimed statistic about the student, and is \
            not required to match any number you were given.
            - Choose PRACTICE_WEAK_AREA when a specific weak sub-topic stands out; RETRY only when the \
            session was short/inconclusive or a repeat would clearly help; NEXT_LEVEL only when \
            performance was strong; NEXT_TOPIC when this sub-topic looks solid and moving on makes sense.
            - Do not repeat every number back at the student -- the screen above you already shows the \
            raw statistics; your job is to say what they mean.
            - Tone: a topic needs attention, the student is not deficient.
            - Write only in the requested language.
            - Keep it concise -- this is read on a phone right after a session ends.""";

    private PersonalNarrativePrompts() {
    }

    public static String sessionFeedbackSystemPrompt() {
        return SESSION_FEEDBACK_SYSTEM;
    }

    public static String mistakeAnalysisSystemPrompt() {
        return MISTAKE_ANALYSIS_SYSTEM;
    }

    public static String profileSummarySystemPrompt() {
        return PROFILE_SUMMARY_SYSTEM;
    }

    public static String practiceResultInsightSystemPrompt() {
        return PRACTICE_RESULT_INSIGHT_SYSTEM;
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

    /**
     * Phase 7.4. Note what is deliberately absent: the authored explanation for the question.
     * Handing the model a ready-made explanation invites it to paraphrase that instead of
     * diagnosing the student's actual slip, which is the one thing this task exists to do and the
     * one thing the authored explanation already on screen above it cannot.
     */
    public static AIMessage mistakeAnalysisUserMessage(MistakeAnalysisRequest mistake, String languageName) {
        String optionLines = mistake.options() == null || mistake.options().isEmpty()
                ? "(not a multiple-choice question)"
                : mistake.options().stream().map(o -> "- " + o).collect(Collectors.joining("\n"));

        String prompt = """
                Language: %s
                Subject: %s
                Topic: %s

                Question:
                %s

                Options:
                %s

                Verified correct answer: %s
                The student chose: %s

                About this student:
                - %s
                - Current state of that topic for them: %s""".formatted(
                languageName,
                mistake.subjectName(),
                mistake.topicName(),
                mistake.questionText(),
                optionLines,
                mistake.correctAnswerText(),
                mistake.selectedAnswerText() == null || mistake.selectedAnswerText().isBlank()
                        ? "(they left it unanswered)"
                        : mistake.selectedAnswerText(),
                repeatLine(mistake.timesAnsweredWrong()),
                mistake.topicState() != null ? mistake.topicState() : "not known");

        return AIMessage.user(prompt);
    }

    /**
     * Qualitative on purpose. {@code timesAnsweredWrong} counts this attempt too, so a bare "1"
     * under a "wrong before" label reads as "once before" -- a real Groq call did exactly that and
     * classified a first-time miss as {@code REPEATED_MISTAKE}, telling the student they had
     * "repeatedly confused" something they had got wrong once. Saying it in words removes the
     * ambiguity, and also keeps a countable statistic about the student out of the prompt.
     */
    private static String repeatLine(Integer timesAnsweredWrong) {
        if (timesAnsweredWrong == null) {
            return "It is not known whether they have missed this question before.";
        }
        return timesAnsweredWrong > 1
                ? "They have missed this same question before, more than once in total."
                : "This is the first time they have missed this question.";
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

    public static AIMessage practiceResultInsightUserMessage(PracticeResultInsightRequest result, String languageName) {
        String subtopicLines = result.subtopics().stream()
                .map(PersonalNarrativePrompts::subtopicLine)
                .collect(Collectors.joining("\n"));
        String highTimeLines = result.highTimeQuestions().stream()
                .map(PersonalNarrativePrompts::flaggedQuestionLine)
                .collect(Collectors.joining("\n"));
        String fastAccurateLines = result.fastAccurateQuestions().stream()
                .map(PersonalNarrativePrompts::flaggedQuestionLine)
                .collect(Collectors.joining("\n"));

        String previousLine = result.previousPerformance() != null && result.previousPerformance().available()
                ? "Previous accuracy for this sub-topic: %d%% -> now %d%% (trend: %s)".formatted(
                        result.previousPerformance().previousAccuracyPercent(),
                        result.previousPerformance().currentAccuracyPercent(),
                        result.previousPerformance().trend())
                : "No previous session data is available for comparison -- base feedback only on this session.";

        String prompt = """
                Language: %s
                Exam: %s
                Subject: %s
                Topic: %s
                Difficulty level: %s

                Overall: %d%% accuracy, %d of %d correct, %d incorrect%s

                Sub-topic breakdown (already computed, includes a performance label you must not \
                contradict):
                %s

                Questions that took much longer than this session's own typical pace:
                %s

                Questions answered both quickly and correctly:
                %s

                %s""".formatted(
                languageName,
                result.examCode() == null ? "(not specified)" : result.examCode(),
                result.subjectName() == null ? "(not specified)" : result.subjectName(),
                result.topicName() == null ? "(not specified)" : result.topicName(),
                result.levelLabel() == null ? "(not specified)" : result.levelLabel(),
                result.accuracyPercent(), result.correctCount(), result.questionsAttempted(), result.incorrectCount(),
                result.averageTimeMs() != null ? ", average %ds/question".formatted(result.averageTimeMs() / 1000) : "",
                subtopicLines.isBlank() ? "(none)" : subtopicLines,
                highTimeLines.isBlank() ? "(none)" : highTimeLines,
                fastAccurateLines.isBlank() ? "(none)" : fastAccurateLines,
                previousLine);

        return AIMessage.user(prompt);
    }

    private static String subtopicLine(SubtopicSnapshotDto s) {
        return "- %s: %d%% accuracy (%d attempted, %d incorrect), label: %s%s".formatted(
                s.name(), s.accuracyPercent(), s.attempted(), s.incorrectCount(), s.performanceLabel(),
                s.averageTimeMs() != null ? ", avg %ds/question".formatted(s.averageTimeMs() / 1000) : "");
    }

    private static String flaggedQuestionLine(FlaggedQuestionDto q) {
        return "- Q%d: %ds%s%s".formatted(q.questionNumber(), q.timeMs() / 1000,
                q.isCorrect() != null ? (q.isCorrect() ? ", correct" : ", incorrect") : "",
                q.subtopicName() != null ? " (" + q.subtopicName() + ")" : "");
    }
}
