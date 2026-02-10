import type { ProjectData } from "./serialize.js";

export const ONBOARDING_SEEN_KEY = "motionforge_onboarding_seen_v1";

export const DEMO_PROJECT_NAME = "MotionForge Demo";

export const DEMO_PROJECT: ProjectData = {
  version: 3,
  objects: [
    {
      id: "demo_cube",
      name: "Demo Cube",
      geometryType: "box",
      color: 0x4b8cff,
      metallic: 0.35,
      roughness: 0.45,
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
  camera: {
    position: [4, 3, 4],
    target: [0, 0, 0],
    fov: 50,
  },
  animation: {
    durationSeconds: 4,
    tracks: [
      {
        objectId: "demo_cube",
        property: "position.x",
        keyframes: [
          { time: 0, value: -1.5, interpolation: "easeInOut" },
          { time: 1.5, value: 1.5, interpolation: "easeInOut" },
          { time: 3, value: -1.5, interpolation: "easeInOut" },
        ],
      },
      {
        objectId: "demo_cube",
        property: "rotation.y",
        keyframes: [
          { time: 0, value: 0, interpolation: "linear" },
          { time: 3, value: 3.141593, interpolation: "linear" },
        ],
      },
    ],
  },
};

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
}

export function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
}

export function resetOnboardingSeen(): void {
  localStorage.removeItem(ONBOARDING_SEEN_KEY);
}

