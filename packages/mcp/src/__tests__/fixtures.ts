export function createSampleProjectJson(): string {
  return JSON.stringify({
    version: 3,
    objects: [
      {
        id: "obj_cube",
        name: "Cube",
        geometryType: "box",
        color: 16711680,
        metallic: 0.3,
        roughness: 0.7,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
    animation: {
      durationSeconds: 2,
      tracks: [
        {
          objectId: "obj_cube",
          property: "position.x",
          keyframes: [
            { time: 0, value: 0, interpolation: "linear" },
            { time: 1, value: 2, interpolation: "linear" },
          ],
        },
      ],
    },
  });
}

export function createMultiObjectProjectJson(): string {
  return JSON.stringify({
    version: 3,
    objects: [
      {
        id: "obj_cube",
        name: "Cube",
        geometryType: "box",
        color: 16711680,
        metallic: 0.3,
        roughness: 0.7,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        id: "obj_cube_2",
        name: "Cube 2",
        geometryType: "box",
        color: 255,
        metallic: 0.2,
        roughness: 0.8,
        position: [2, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
    animation: {
      durationSeconds: 2,
      tracks: [],
    },
  });
}
