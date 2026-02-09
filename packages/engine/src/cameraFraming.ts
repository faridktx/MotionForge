/**
 * Given a bounding sphere radius and camera field of view (in radians),
 * compute the minimum distance the camera needs to be from the sphere center
 * to fully frame the sphere.
 */
export function framingDistance(sphereRadius: number, fovRadians: number): number {
  if (sphereRadius <= 0 || fovRadians <= 0) return 0;
  return sphereRadius / Math.sin(fovRadians / 2);
}
