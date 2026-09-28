import React from "react";
import { SceneSequence, computeSequenceDuration, buildLessonScenes } from "@sarkaritaayari/scene-engine";
import { VIDEO_FORMATS } from "@sarkaritaayari/shared";
import { validateLesson, lessonToSceneSpecs } from "@sarkaritaayari/lesson-engine";
import manifest from "../../public/audio/simple-interest-basics/narration-manifest.json";
import lessonJson from "../../../../lessons/simple-interest-basics.json";

const fps = VIDEO_FORMATS.landscape.fps;
const lesson = validateLesson(lessonJson);
const sceneSpecs = lessonToSceneSpecs(lesson, fps);
const scenes = buildLessonScenes(sceneSpecs, manifest, fps);

export const SimpleInterestBasics: React.FC = () => <SceneSequence scenes={scenes} />;

export const SIMPLE_INTEREST_BASICS_DURATION_IN_FRAMES = computeSequenceDuration(scenes);
