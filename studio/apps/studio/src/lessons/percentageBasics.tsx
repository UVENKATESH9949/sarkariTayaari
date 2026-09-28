import React from "react";
import { SceneSequence, computeSequenceDuration, buildLessonScenes } from "@sarkaritaayari/scene-engine";
import { VIDEO_FORMATS } from "@sarkaritaayari/shared";
import { validateLesson, lessonToSceneSpecs } from "@sarkaritaayari/lesson-engine";
import manifest from "../../public/audio/percentage-basics/narration-manifest.json";
import lessonJson from "../../../../lessons/percentage-basics.json";

/**
 * Run `npm run synthesize:percentage-basics` (or the `:local` variant) first
 * to generate the narration manifest this file imports. Everything else —
 * scene content, timing, narration — lives in lessons/percentage-basics.json;
 * this file only wires validated lesson + manifest together.
 */
const fps = VIDEO_FORMATS.landscape.fps;
const lesson = validateLesson(lessonJson);
const sceneSpecs = lessonToSceneSpecs(lesson, fps);
const scenes = buildLessonScenes(sceneSpecs, manifest, fps);

export const PercentageBasics: React.FC = () => <SceneSequence scenes={scenes} />;

export const PERCENTAGE_BASICS_DURATION_IN_FRAMES = computeSequenceDuration(scenes);
