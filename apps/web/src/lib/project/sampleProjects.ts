import type { Clip } from "@motionforge/engine";
import { animationStore } from "../../state/animationStore.js";
import { sceneStore } from "../../state/sceneStore.js";
import { timelineStore } from "../../state/timelineStore.js";
import { undoStore } from "../../state/undoStore.js";
import { insertBuiltInDemoModel } from "../three/demoModel.js";
import { deserializeProject, newProject } from "./deserialize.js";
import type { ProjectData } from "./serialize.js";
import { DEMO_PROJECT } from "./demoProject.js";

export interface SampleProjectBase {
  id: string;
  title: string;
  description: string;
}

export interface ProjectDataSampleProject extends SampleProjectBase {
  kind: "project";
  project: ProjectData;
}

export interface LoaderSampleProject extends SampleProjectBase {
  kind: "loader";
  load: () => Promise<void>;
}

export type SampleProjectDefinition = ProjectDataSampleProject | LoaderSampleProject;

const MATERIAL_SAMPLE: ProjectData = {
  version: 4,
  objects: [
    {
      id: "mat_cube",
      name: "Polished Cube",
      bindPath: "Polished_Cube",
      geometryType: "box",
      color: 0x2255dd,
      metallic: 0.9,
      roughness: 0.2,
      position: [-1.5, 0.5, 0],
      rotation: [0, 0.4, 0],
      scale: [1, 1, 1],
    },
    {
      id: "mat_sphere",
      name: "Matte Sphere",
      bindPath: "Matte_Sphere",
      geometryType: "sphere",
      color: 0xdd8833,
      metallic: 0.05,
      roughness: 0.9,
      position: [1.5, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
  camera: {
    position: [4.5, 2.5, 4.5],
    target: [0, 0.5, 0],
    fov: 50,
  },
};

const TIMELINE_LANE_SAMPLE: ProjectData = {
  version: 4,
  objects: [
    {
      id: "lane_cube",
      name: "Lane Cube",
      bindPath: "Lane_Cube",
      geometryType: "box",
      color: 0x4b8cff,
      metallic: 0.3,
      roughness: 0.5,
      position: [-1, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    {
      id: "lane_sphere",
      name: "Lane Sphere",
      bindPath: "Lane_Sphere",
      geometryType: "sphere",
      color: 0x33cc88,
      metallic: 0.1,
      roughness: 0.7,
      position: [1, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
  animation: {
    durationSeconds: 4,
    tracks: [
      {
        objectId: "lane_cube",
        property: "position.x",
        keyframes: [
          { time: 0, value: -1.2, interpolation: "easeInOut" },
          { time: 2, value: 1.3, interpolation: "easeInOut" },
          { time: 4, value: -1.2, interpolation: "easeInOut" },
        ],
      },
      {
        objectId: "lane_cube",
        property: "rotation.y",
        keyframes: [
          { time: 0, value: 0, interpolation: "linear" },
          { time: 4, value: 6.283185, interpolation: "linear" },
        ],
      },
      {
        objectId: "lane_sphere",
        property: "position.y",
        keyframes: [
          { time: 0, value: 0.4, interpolation: "step" },
          { time: 1.5, value: 1.4, interpolation: "step" },
          { time: 3, value: 0.4, interpolation: "step" },
        ],
      },
      {
        objectId: "lane_sphere",
        property: "scale.z",
        keyframes: [
          { time: 0, value: 1, interpolation: "linear" },
          { time: 2, value: 1.6, interpolation: "easeOut" },
          { time: 4, value: 1, interpolation: "easeIn" },
        ],
      },
    ],
  },
  camera: {
    position: [4.5, 3.5, 5],
    target: [0, 0.5, 0],
    fov: 50,
  },
};

async function loadDemoModelAnimationSample(): Promise<void> {
  newProject();
  const payload = await insertBuiltInDemoModel();
  const rootId = sceneStore.getIdForObject(payload.root);
  if (!rootId) {
    throw new Error("Failed to resolve imported demo model id.");
  }

  const clip: Clip = {
    durationSeconds: 4,
    tracks: [
      {
        objectId: rootId,
        property: "rotation.y",
        keyframes: [
          { time: 0, value: 0, interpolation: "linear" },
          { time: 4, value: 6.283185, interpolation: "linear" },
        ],
      },
      {
        objectId: rootId,
        property: "position.x",
        keyframes: [
          { time: 0, value: -1.2, interpolation: "easeInOut" },
          { time: 2, value: 1.2, interpolation: "easeInOut" },
          { time: 4, value: -1.2, interpolation: "easeInOut" },
        ],
      },
    ],
  };

  animationStore.setClip(clip, { markDirty: false });
  sceneStore.setSelectedId(rootId);
  undoStore.clear();
  timelineStore.clearAllUiState();
  sceneStore.clearDirty();
}

export const SAMPLE_PROJECTS: SampleProjectDefinition[] = [
  {
    id: "primitives-demo",
    title: "Primitives Demo",
    description: "Starter scene with animated primitive object keyframes.",
    kind: "project",
    project: {
      ...DEMO_PROJECT,
      version: 4,
    },
  },
  {
    id: "demo-model-animation",
    title: "Demo Model Animation",
    description: "Built-in deterministic GLB inserted and animated on timeline.",
    kind: "loader",
    load: loadDemoModelAnimationSample,
  },
  {
    id: "material-demo",
    title: "Material Demo",
    description: "Contrasting metallic/roughness setup for fast shading tweaks.",
    kind: "project",
    project: MATERIAL_SAMPLE,
  },
  {
    id: "timeline-lane-demo",
    title: "Timeline Lane Demo",
    description: "Multi-object lane tracks with mixed interpolation modes.",
    kind: "project",
    project: TIMELINE_LANE_SAMPLE,
  },
];

export async function loadSampleProject(sample: SampleProjectDefinition): Promise<void> {
  if (sample.kind === "project") {
    await deserializeProject(sample.project);
    return;
  }
  await sample.load();
}
