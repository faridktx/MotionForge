export type RecipeId =
  | "bounce"
  | "anticipation-and-hit"
  | "idle-loop"
  | "camera-dolly"
  | "turn-in-place"
  | "recoil";

export interface RecipeDefinition {
  id: RecipeId;
  label: string;
  triggerPhrases: string[];
  defaultDurationSec: number;
  touchedTracks: string[];
  loopFriendly: boolean;
}

export const RECIPE_DEFINITIONS: readonly RecipeDefinition[] = [
  {
    id: "bounce",
    label: "Bounce (Squash/Stretch)",
    triggerPhrases: ["bounce", "squash stretch bounce"],
    defaultDurationSec: 1,
    touchedTracks: ["position.y", "scale.x", "scale.y", "scale.z"],
    loopFriendly: false,
  },
  {
    id: "anticipation-and-hit",
    label: "Anticipation and Hit",
    triggerPhrases: ["anticipation-and-hit", "anticipation hit", "anticipation"],
    defaultDurationSec: 1.2,
    touchedTracks: ["position.z", "rotation.x", "rotation.z"],
    loopFriendly: false,
  },
  {
    id: "idle-loop",
    label: "Idle Loop",
    triggerPhrases: ["idle-loop", "idle loop", "hover idle", "breathing idle"],
    defaultDurationSec: 2,
    touchedTracks: ["position.y", "rotation.y"],
    loopFriendly: true,
  },
  {
    id: "camera-dolly",
    label: "Camera Dolly",
    triggerPhrases: ["camera-dolly", "camera dolly", "dolly shot"],
    defaultDurationSec: 3,
    touchedTracks: ["position.z", "position.x"],
    loopFriendly: false,
  },
  {
    id: "turn-in-place",
    label: "Turn In Place",
    triggerPhrases: ["turn-in-place", "turn in place", "rotate 90", "turn 90"],
    defaultDurationSec: 1,
    touchedTracks: ["rotation.y"],
    loopFriendly: false,
  },
  {
    id: "recoil",
    label: "Recoil",
    triggerPhrases: ["recoil", "kick back", "kickback"],
    defaultDurationSec: 0.4,
    touchedTracks: ["position.z", "rotation.x"],
    loopFriendly: false,
  },
] as const;

export function recipeSuggestions(): string[] {
  return RECIPE_DEFINITIONS.map((recipe) => recipe.triggerPhrases[0] ?? recipe.id);
}
