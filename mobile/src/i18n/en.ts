/**
 * The English string catalogue — the source of truth for every piece of interface text.
 *
 * `te.ts` is typed against this object's exact shape, so a key added here and forgotten
 * there is a compile error rather than a Telugu screen with an English word in it. That is
 * the whole reason the catalogue is a nested literal instead of a flat map: the type is the
 * coverage check.
 *
 * What belongs here: labels, buttons, headings, empty states, error messages, dialogs.
 * What does NOT: exam content. Question text, options and explanations are per-question
 * translations that come from the server (`question_translations`) and are chosen by the
 * separate quiz-language preference. Doc 2 §11 is explicit that this feature must not
 * touch them, and nothing in this file can, because no question text passes through it.
 *
 * Placeholders are `{name}` and are substituted by `t()`. Pluralisation is handled by
 * having both forms as separate keys (`one`/`other`) rather than by a rules engine — with
 * two languages and a handful of counted nouns, a CLDR plural implementation would be more
 * machinery than the problem deserves.
 */
export const en = {
  common: {
    cancel: "Cancel",
    clear: "Clear",
    ok: "OK",
    stay: "Stay",
    leave: "Leave",
    exit: "Exit",
    submit: "Submit",
    previous: "Previous",
    next: "Next",
    finish: "Finish",
    tryAgain: "Try Again",
    goBack: "Go back",
    retry: "Retry",
    preparing: "PREPARING",
    explanation: "Explanation",
    correct: "Correct",
    incorrect: "Incorrect",
    wrong: "Wrong",
    answered: "Answered",
    unanswered: "Unanswered",
    unattempted: "Unattempted",
    accuracy: "Accuracy",
    questions: "Questions",
    appName: "SarkariTaiyaari",
  },

  nav: {
    home: "Home",
    practice: "Practice",
    mockTest: "Mock Test",
    progress: "Progress",
    more: "More",
    revise: "Revise",
    account: "Your account",
    settings: "Settings",
    subjects: "Subjects",
    topics: "Topics",
    levels: "Levels",
    quiz: "Quiz",
    testDetails: "Test Details",
    result: "Result",
    examGuide: "Exam Guide",
    exams: "Exams",
  },

  network: {
    offline: "You're offline — using downloaded content",
    backOnline: "Back online",
  },

  home: {
    welcome: "Welcome back 👋",
    preparingFor: "Preparing for",
    continuePractice: "Continue Practice",
    readiness: "Your readiness",
    viewProgress: "View progress",
    bookmarked: "Bookmarked",
    wrongAnswers: "Wrong Answers",
    yourProgressTitle: "Your Progress",
    overallReadiness: "Overall readiness",
    practiceAccuracy: "Practice accuracy",
    sessions: "Sessions",
    exploreExams: "Explore exams",
  },

  topicChips: {
    stateNotStarted: "Not started",
    stateLearning: "Learning",
    statePracticing: "Practising",
    stateMastered: "Mastered",
    stateNeedsRevision: "Needs revision",
    trendRising: "Rising",
    trendFalling: "Falling",
    priorityHigh: "High priority",
    priorityMedium: "Medium priority",
    weightageOfPaper: "{percent}% of paper",
    bestAfter: "Best after: {names}",
    andMore: " +{count} more",
  },

  practice: {
    allExams: "All Government Exams",
    allExamsSubtitle: "Common Quant, Reasoning, English & GA content",
    startPracticing: "Start practicing",
    searchExams: "Search exams...",
    noExamsSynced: "No exams synced yet",
    noExamsSyncedBody: "More exams are added as they're synced.",
    noExamsMatch: 'No exams match "{query}"',
    noQuestionsForExam: "No questions yet",
    thisExam: "this exam",
    thisSubject: "this subject",
    loadingSubjects: "Preparing subjects for {exam}...",
    yourExam: "your exam",
    highestWeightage: "Highest-weightage topics for {exam}",
    recommended: "Recommended",
    chooseSubject: "Choose a subject",
    subjectsShared: "Shared across every exam you're preparing for",
    searchSubjects: "Search subjects...",
    noSubjects: "No subjects synced yet",
    noSubjectsBody: "Subjects appear here once they're synced.",
    chooseTopic: "Choose a topic",
    noTopics: "No topics synced yet",
    noTopicsBody: "Topics appear here once they're synced.",
    chooseLevel: "Choose a level",
    allLevels: "All Levels",
    practiceByDifficulty: "Practice by difficulty",
    loadingLevels: "Getting your practice levels ready...",
    focusNext: "Focus next",
    sortByPriority: "By priority",
    sortBySyllabus: "Syllabus order",
    levelPillLabel: "level",
    noQuestionsYet: "No questions yet",
    levelMixed: "{questions} · mixed difficulty",
    questionsOne: "1 question",
    questionsOther: "{count} questions",
  },

  quiz: {
    loading: "Preparing your questions...",
    noQuestions: "No questions available",
    noQuestionsOffline:
      "You're offline and this content hasn't downloaded yet. Connect to the internet once to download it.",
    noQuestionsSynced: "There's nothing synced for this selection yet.",
    /** {current} of {total}, plus how many have been answered. */
    progress: "Question {current} of {total} · {answered} answered",
    notTranslated: "Not yet translated to {language} — showing English.",
    pyqAsked: "Asked in {year}",
    pyqAskedWithShift: "Asked in {year} · {shift}",
    pyqUnknownYear: "Previous year question",
    finishWithCount: "Finish ({count})",
    finishNow: "Finish now with {answered} of {total} answered",
    leaveTitle: "Leave this practice?",
    leaveMessage: "Your answers so far won't be saved unless you finish the session.",
  },

  summary: {
    title: "Session Summary",
    accuracyLine: "{percent}% accuracy",
    questionByQuestion: "Question by question",
    viewHistory: "View Session History",
    backToPractice: "Back to Practice",
    notFound: "Session not found",
    notFoundBody: "This session may have been cleared from your history.",
    earlyFinish: "Finished early · {answered} of {available} answered, {skipped} left",
  },

  history: {
    title: "Session History",
    limitNote: "Showing up to your 50 most recent sessions.",
    empty: "No practice sessions yet",
    emptyBody: "Finish a quiz to see it here.",
    justNow: "Just now",
    yesterday: "Yesterday",
    minAgo: "{count} min ago",
    hrAgo: "{count} hr ago",
    daysAgo: "{count} days ago",
    today: "today",
    relYesterday: "yesterday",
  },

  mock: {
    title: "Mock Test",
    papersTitle: "Full-length Mock Tests",
    papersSubtitle: "Timed, exam-pattern tests with real negative marking — just like the real thing.",
    attempted: "ATTEMPTED",
    bestScore: "BEST SCORE",
    avgTime: "AVG TIME",
    tag: "MOCK TEST",
    startTest: "Start Test",
    loadingPapers: "Finding the right mock tests for you...",
    noPapers: "No mock tests yet",
    noPapersBody: "This exam needs a paper defined in its structure before a test can be built from it.",
    marking: "Marking",
    sections: "Sections",
    beforeYouStart: "Before you start",
    loadingDetails: "Preparing your test details...",
    notAvailable: "Test not available",
    notAvailableBody: "This paper is no longer part of the exam's structure.",
    clearAnswer: "Clear answer",
    navigator: "Question Navigator",
    marked: "Marked",
    submitting: "Submitting your test…",
    saveFailed: "Couldn't save your result",
    saveFailedBody: "Please try submitting again.",
    exitTitle: "Exit without submitting?",
    exitMessage: "Your progress on this attempt will be lost.",
    keepGoing: "Keep going",
    keepReviewing: "Keep reviewing",
    submitTitle: "Submit test?",
    sectionBreakdown: "Section-wise breakdown",
    backToMock: "Back to Mock Test",
    loadingResult: "Preparing your performance report...",
    searchExams: "Search exams...",
    fullTestOne: "full test",
    fullTestOther: "full tests",
    startTestDisabled: "Not enough questions yet",
    notEnoughSynced: "There aren't enough questions synced for this paper yet.",
    markForReview: "Mark for review",
    submitMessage:
      "{unanswered} unanswered{marked}. You can't change answers after submitting.",
    submitMessageMarked: ", {count} marked for review",
  },

  progress: {
    title: "Your Progress",
    viewFullHistory: "View full session history",
    readinessScore: "Exam Readiness Score",
    questionsAttempted: "Questions attempted",
    sessionsCompleted: "Sessions completed",
    subjectAccuracy: "Subject-wise accuracy",
    notAttempted: "Not attempted yet",
    loading: "Preparing your performance report...",
    readinessBasis: "Based on your accuracy across all practice sessions.",
    readinessEmpty: "Complete a practice session to see your score.",
    sessionsLogged: "{count} logged · last active {when}",
  },

  more: {
    title: "More",
    account: "Account",
    study: "Study",
    progressValue: "Syllabus, sessions and accuracy",
    yourAccount: "Your account",
    saveProgress: "Save your progress",
    notSignedIn: "Not signed in — progress is only on this phone",
    preferences: "Preferences",
    quizLanguage: "Default quiz language",
    appearanceAndLanguage: "Appearance & language",
    appearanceValue: "Theme, text size, app language",
    data: "Data",
    syncPreparing: "Preparing content sync...",
    syncChecking: "Checking for updates...",
    syncDownloading: "Downloading your content...",
    syncKeepUsing: "You can keep using the app while this finishes",
    syncFailed: "Sync couldn't be completed",
    syncFailedBody: "Your existing offline data is still available.",
    syncUpToDate: "Content is up to date",
    syncLastSynced: "Last synced: {when}",
    syncNow: "Sync Now",
    syncing: "Syncing…",
    syncStarting: "Starting…",
    syncRetrying: "Retrying…",
    notDownloaded: "Not downloaded yet",
    notDownloadedBody: "Connect to the internet to download content for offline use",
    clearHistory: "Clear practice history",
    clearHistoryValue: "Removes all recorded sessions",
    clearHistoryTitle: "Clear practice history?",
    clearHistoryMessage:
      "This will remove all your recorded practice sessions. Bookmarked questions won't be affected. This can't be undone.",
    about: "About",
    version: "Version {version}",
    syncProgress: "{percent}% · {synced} / {total} questions",
    today: "Today, {time}",
    yesterday: "Yesterday, {time}",
  },

  settings: {
    title: "Settings",
    appearance: "Appearance",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    textSize: "Text size",
    textSizeHint: "Makes question and answer text larger without changing the layout.",
    zoomOut: "Smaller text",
    zoomIn: "Larger text",
    reset: "Reset",
    sample: "Sample: this is how question text will look.",
    language: "App language",
    languageHint: "Changes the app's own labels and buttons. Question text is unaffected — pick that in the quiz.",
    languageEnglish: "English",
    languageTelugu: "తెలుగు",
  },

  account: {
    title: "Your account",
    saving: "Saving your progress…",
    backedUp: "Progress is backed up to your account",
    name: "Your name (optional)",
    email: "Email",
    password: "Password",
    keepPractising: "You can keep practising without an account — this only backs your progress up.",
    loading: "Loading your account...",
    namePlaceholder: "Your name",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "At least 8 characters",
    signOutTitle: "Sign out?",
    signOutMessage: "Your progress is saved to your account first. It stays on this phone too.",
    signOut: "Sign out",
  },

  revise: {
    title: "Revise",
    bookmarked: "Bookmarked",
    wrongAnswers: "Wrong Answers",
    removeBookmark: "Remove bookmark",
  },

  prepare: {
    heading: "We're preparing your SarkariTaiyaari experience.",
    subheading: "This may take a moment depending on your network — please stay with us.",
    settingUpExams: "Setting up exam data",
    downloadingQuestions: "Downloading practice questions",
    // NOTE: app/_layout.tsx's "Setting up local database..." and "Database migration
    // failed" screens are deliberately NOT here. They render before any provider mounts,
    // because the preference that selects the language lives in the very database whose
    // migration has not finished. Putting keys here for them would claim coverage that is
    // impossible to deliver.
  },

  session: {
    leaveTestTitle: "Leave this test?",
    leaveTestMessage:
      "You are moving to another module. Your current test state may be lost if you leave now.",
  },

  languagePicker: {
    search: "Search languages...",
    selectLanguage: "Select language",
    quizLanguageTitle: "Default quiz language",
  },
} as const;

/**
 * The catalogue's SHAPE, with every leaf widened back to `string`.
 *
 * `en` is `as const` so that the dotted key paths in I18nContext can be derived from it,
 * but that also makes every leaf a literal type — and typing `te` as `typeof en` would then
 * demand that the Telugu value for `cancel` be the string "Cancel". Widening the leaves
 * keeps the key checking (which is the point) and drops the value checking (which is not).
 */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Catalogue = Widen<typeof en>;
