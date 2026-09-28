import React from "react";
import { SceneSequence, computeSequenceDuration, buildLessonScenes } from "@sarkaritaayari/scene-engine";
import { VIDEO_FORMATS } from "@sarkaritaayari/shared";
import { validateLesson, lessonToSceneSpecs } from "@sarkaritaayari/lesson-engine";
import manifest from "../../public/audio/profit-and-loss/narration-manifest.json";
import lessonJson from "../../../../lessons/profit-and-loss.json";

/**
 * Demo lesson proving Milestone 5's premise: this file is identical in shape
 * to percentageBasics.tsx / simpleInterestBasics.tsx even though its lesson
 * JSON was authored as a stand-in for what an LLM would generate, not by
 * hand-tuning scene-engine props directly.
 */
const fps = VIDEO_FORMATS.landscape.fps;
const lesson = validateLesson(lessonJson);
const sceneSpecs = lessonToSceneSpecs(lesson, fps);
const scenes = buildLessonScenes(sceneSpecs, manifest, fps);

export const ProfitAndLoss: React.FC = () => <SceneSequence scenes={scenes} />;

export const PROFIT_AND_LOSS_DURATION_IN_FRAMES = computeSequenceDuration(scenes);
