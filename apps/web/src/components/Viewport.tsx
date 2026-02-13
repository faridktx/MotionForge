import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject } from "../lib/three/disposeObject.js";
import { raycastSelection } from "../lib/three/selection.js";
import { computeBoundingSphere, frameSphere } from "../lib/three/cameraFraming.js";
import { Gizmo, type GizmoMode } from "../lib/three/gizmo/Gizmo.js";
import { DirectDragSession } from "../lib/three/directDragSession.js";
import {
  computeDragPlane,
  pointerRayToPlaneIntersection,
  type DirectDragPlaneMode,
} from "../lib/three/directDrag.js";
import { sceneStore } from "../state/sceneStore.js";
import { undoStore } from "../state/undoStore.js";
import { animationStore } from "../state/animationStore.js";
import { rendererStatsStore, type RendererStatsSnapshot } from "../state/rendererStatsStore.js";
import { commandBus } from "../lib/commands/commandBus.js";
import { createDefaultObjects } from "../lib/project/deserialize.js";

interface ViewportProps {
  onModeChange?: (mode: GizmoMode) => void;
}

const HIGHLIGHT_EMISSIVE = new THREE.Color(0x335599);
const DEFAULT_EMISSIVE = new THREE.Color(0x000000);
const CLICK_DRAG_THRESHOLD_SQ = 9;
const DIRECT_DRAG_SNAP_STEP = 0.1;

function isTextInputFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable;
}

export function Viewport({ onModeChange }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [statsEnabled, setStatsEnabled] = useState(() => rendererStatsStore.getEnabled());
  const [stats, setStats] = useState<RendererStatsSnapshot>({
    fps: 0,
    drawCalls: 0,
    geometries: 0,
    textures: 0,
  });

  useEffect(() => {
    return rendererStatsStore.subscribe(() => {
      setStatsEnabled(rendererStatsStore.getEnabled());
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // -- Renderer --
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x2a2a2a);
    container.appendChild(renderer.domElement);

    // -- Scene --
    const scene = new THREE.Scene();

    // -- Camera --
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(4, 3, 4);
    camera.lookAt(0, 0, 0);

    // -- Controls --
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    sceneStore.setScene(scene, camera, controls.target);

    function preventScroll(e: WheelEvent) { e.preventDefault(); }
    renderer.domElement.addEventListener("wheel", preventScroll, { passive: false });

    // -- Grid + Axes --
    const grid = new THREE.GridHelper(10, 10, 0x444444, 0x333333);
    grid.name = "__grid";
    scene.add(grid);
    const axes = new THREE.AxesHelper(3);
    axes.name = "__axes";
    scene.add(axes);
    let gridVisible = true;

    // -- Lights --
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    ambient.name = "__ambient";
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(5, 10, 7);
    dirLight.name = "__dirLight";
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
    fillLight.position.set(-3, 4, -5);
    fillLight.name = "__fillLight";
    scene.add(fillLight);

    // -- Default objects --
    const defaultMeshes = createDefaultObjects();
    for (const mesh of defaultMeshes) {
      scene.add(mesh);
      sceneStore.registerObject(mesh);
    }

    // -- Gizmo --
    const dragStartPos = new THREE.Vector3();
    const dragStartQuat = new THREE.Quaternion();
    const dragStartScale = new THREE.Vector3();

    let frameTweenId = 0;
    function stopFrameTween() {
      if (frameTweenId !== 0) {
        cancelAnimationFrame(frameTweenId);
        frameTweenId = 0;
      }
    }

    function smoothFrame(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3) {
      stopFrameTween();

      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      const durationMs = 250;
      const startTime = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(startPosition, targetPosition, eased);
        controls.target.lerpVectors(startTarget, targetLookAt, eased);

        if (t < 1) {
          frameTweenId = requestAnimationFrame(step);
        } else {
          frameTweenId = 0;
        }
      };

      frameTweenId = requestAnimationFrame(step);
    }

    const gizmo = new Gizmo(camera, renderer.domElement, {
      onDragStart() {
        controls.enabled = false;
        const obj = sceneStore.getSelectedObject();
        if (obj) {
          dragStartPos.copy(obj.position);
          dragStartQuat.copy(obj.quaternion);
          dragStartScale.copy(obj.scale);
        }
      },
      onDrag() {
        sceneStore.notifyTransformChanged({ markDirty: false });
      },
      onDragEnd() {
        controls.enabled = true;
        const obj = sceneStore.getSelectedObject();
        if (obj) {
          const endPos = obj.position.clone();
          const endQuat = obj.quaternion.clone();
          const endScale = obj.scale.clone();
          const startP = dragStartPos.clone();
          const startQ = dragStartQuat.clone();
          const startS = dragStartScale.clone();
          const ref = obj;

          const changed =
            !startP.equals(endPos) ||
            !startQ.equals(endQuat) ||
            !startS.equals(endScale);
          if (!changed) {
            sceneStore.notifyTransformChanged({ markDirty: false });
            return;
          }

          undoStore.pushExecuted({
            label: `Gizmo ${gizmo.getMode()}`,
            do() {
              ref.position.copy(endPos);
              ref.quaternion.copy(endQuat);
              ref.scale.copy(endScale);
              gizmo.syncPosition();
              sceneStore.notifyTransformChanged();
            },
            undo() {
              ref.position.copy(startP);
              ref.quaternion.copy(startQ);
              ref.scale.copy(startS);
              gizmo.syncPosition();
              sceneStore.notifyTransformChanged();
            },
          });
          sceneStore.markDirty();
          sceneStore.notifyTransformChanged({ markDirty: false });
        }
      },
      onCancel() {
        controls.enabled = true;
        sceneStore.notifyTransformChanged({ markDirty: false });
      },
    });
    scene.add(gizmo.root);
    gizmo.root.visible = false;

    // -- Selection highlight --
    let highlightedMesh: THREE.Mesh | null = null;

    function setHighlight(mesh: THREE.Mesh | null) {
      if (highlightedMesh) {
        const mat = highlightedMesh.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(DEFAULT_EMISSIVE);
      }
      highlightedMesh = mesh;
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(HIGHLIGHT_EMISSIVE);
      }
    }

    function syncHighlightToStore() {
      const selId = sceneStore.getSelectedId();
      if (!selId) {
        setHighlight(null);
        gizmo.detach();
        return;
      }
      const obj = sceneStore.getObjectById(selId);
      if (!obj) {
        setHighlight(null);
        gizmo.detach();
        return;
      }
      if (obj instanceof THREE.Mesh) setHighlight(obj);
      else setHighlight(null);
      gizmo.attach(obj);
    }

    const unsubSelection = sceneStore.subscribe("selection", syncHighlightToStore);
    // Also sync gizmo position when transform changes externally
    const unsubTransform = sceneStore.subscribe("transform", () => {
      gizmo.syncPosition();
    });

    // -- Click selection + direct drag --
    interface PendingDirectDrag {
      pointerId: number;
      object: THREE.Object3D;
      objectId: string;
      startGroundHit: THREE.Vector3;
      startCameraHit: THREE.Vector3;
    }

    let pointerDownPos = { x: 0, y: 0 };
    let pendingDirectDrag: PendingDirectDrag | null = null;
    let activeDirectDrag: DirectDragSession | null = null;
    let activeDirectDragPointerId: number | null = null;
    let activeDirectDragAnchor: THREE.Vector3 | null = null;
    let ignorePointerUpForClick: number | null = null;

    function releasePointerCapture(pointerId: number | null) {
      if (pointerId === null) return;
      if (renderer.domElement.hasPointerCapture(pointerId)) {
        renderer.domElement.releasePointerCapture(pointerId);
      }
    }

    function resolveDragMode(e: PointerEvent): DirectDragPlaneMode {
      return e.shiftKey ? "camera" : "ground";
    }

    function shouldSnapDrag(e: PointerEvent): boolean {
      return e.ctrlKey || e.altKey;
    }

    function computePlaneHit(
      e: PointerEvent,
      anchor: THREE.Vector3,
      mode: DirectDragPlaneMode,
    ): THREE.Vector3 | null {
      const plane = computeDragPlane(camera, anchor, mode);
      return pointerRayToPlaneIntersection(e, camera, renderer.domElement, plane);
    }

    function cancelDirectDrag(): boolean {
      if (!activeDirectDrag) return false;
      const pointerId = activeDirectDragPointerId;
      activeDirectDrag.cancel();
      releasePointerCapture(pointerId);
      if (pointerId !== null) {
        ignorePointerUpForClick = pointerId;
      }
      activeDirectDrag = null;
      activeDirectDragPointerId = null;
      activeDirectDragAnchor = null;
      pendingDirectDrag = null;
      controls.enabled = true;
      return true;
    }

    function finishDirectDrag() {
      if (!activeDirectDrag) return;
      activeDirectDrag.commit();
      releasePointerCapture(activeDirectDragPointerId);
      activeDirectDrag = null;
      activeDirectDragPointerId = null;
      activeDirectDragAnchor = null;
      controls.enabled = true;
    }

    function startDirectDrag(e: PointerEvent): DirectDragSession | null {
      if (!pendingDirectDrag) return null;
      if (gizmo.isDragging()) return null;

      const { object, objectId, startGroundHit, startCameraHit } = pendingDirectDrag;
      if (sceneStore.getIdForObject(object) !== objectId) {
        pendingDirectDrag = null;
        controls.enabled = true;
        return null;
      }

      if (animationStore.isPlaying()) {
        animationStore.pause();
      }
      if (sceneStore.getSelectedId() !== objectId) {
        sceneStore.setSelectedId(objectId);
      }

      activeDirectDrag = new DirectDragSession({
        object,
        label: "Direct Drag",
        startGroundHit,
        startCameraHit,
        snapStep: DIRECT_DRAG_SNAP_STEP,
      });
      activeDirectDragPointerId = e.pointerId;
      activeDirectDragAnchor = activeDirectDrag.getAnchorPosition();
      if (!renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.setPointerCapture(e.pointerId);
      }
      pendingDirectDrag = null;
      controls.enabled = false;
      return activeDirectDrag;
    }

    function onPointerDown(e: PointerEvent) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      if (e.button !== 0) return;
      if (gizmo.isDragging() || gizmo.isPointerOverHandle(e)) return;

      const selectables = sceneStore.getAllUserObjects();
      const hit = raycastSelection(e, camera, renderer.domElement, selectables);
      const objectId = hit ? sceneStore.getIdForObject(hit) : null;
      if (!hit || !objectId || isTextInputFocused()) {
        pendingDirectDrag = null;
        controls.enabled = true;
        return;
      }

      const anchor = hit.position.clone();
      const startGroundHit = computePlaneHit(e, anchor, "ground");
      const startCameraHit = computePlaneHit(e, anchor, "camera");
      if (!startGroundHit || !startCameraHit) {
        pendingDirectDrag = null;
        controls.enabled = true;
        return;
      }

      pendingDirectDrag = {
        pointerId: e.pointerId,
        object: hit,
        objectId,
        startGroundHit,
        startCameraHit,
      };
      controls.enabled = false;
      if (!renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (activeDirectDrag) {
        if (e.pointerId !== activeDirectDragPointerId || !activeDirectDragAnchor) return;
        const mode = resolveDragMode(e);
        const currentHit = computePlaneHit(e, activeDirectDragAnchor, mode);
        if (!currentHit) return;
        activeDirectDrag.update({
          mode,
          currentHit,
          snapEnabled: shouldSnapDrag(e),
        });
        e.preventDefault();
        return;
      }

      if (!pendingDirectDrag) return;
      if (pendingDirectDrag.pointerId !== e.pointerId) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy <= CLICK_DRAG_THRESHOLD_SQ) return;
      const directDragSession = startDirectDrag(e);
      if (!directDragSession || !activeDirectDragAnchor) {
        pendingDirectDrag = null;
        controls.enabled = true;
        return;
      }

      const mode = resolveDragMode(e);
      const currentHit = computePlaneHit(e, activeDirectDragAnchor, mode);
      if (!currentHit) return;
      directDragSession.update({
        mode,
        currentHit,
        snapEnabled: shouldSnapDrag(e),
      });
      e.preventDefault();
    }

    function onPointerCancel(e: PointerEvent) {
      if (activeDirectDrag && activeDirectDragPointerId === e.pointerId) {
        cancelDirectDrag();
        return;
      }
      if (pendingDirectDrag && pendingDirectDrag.pointerId === e.pointerId) {
        pendingDirectDrag = null;
        releasePointerCapture(e.pointerId);
        controls.enabled = true;
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (e.button !== 0) return;
      if (ignorePointerUpForClick === e.pointerId) {
        ignorePointerUpForClick = null;
        releasePointerCapture(e.pointerId);
        controls.enabled = true;
        return;
      }

      if (activeDirectDrag && activeDirectDragPointerId === e.pointerId) {
        finishDirectDrag();
        return;
      }

      if (pendingDirectDrag && pendingDirectDrag.pointerId === e.pointerId) {
        pendingDirectDrag = null;
        releasePointerCapture(e.pointerId);
        controls.enabled = true;
      }

      if (gizmo.isDragging()) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_SQ) return;

      const selectables = sceneStore.getAllUserObjects();
      const hit = raycastSelection(e, camera, renderer.domElement, selectables);
      if (hit) {
        const id = sceneStore.getIdForObject(hit);
        sceneStore.setSelectedId(id);
      } else {
        sceneStore.setSelectedId(null);
      }
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);

    const frameSelected = () => {
      const sel = sceneStore.getSelectedObject();
      if (sel) {
        const bs = computeBoundingSphere([sel]);
        if (bs) {
          const framing = frameSphere(bs, camera);
          smoothFrame(framing.position, framing.target);
          return;
        }
      }
      smoothFrame(new THREE.Vector3(4, 3, 4), new THREE.Vector3(0, 0, 0));
    };

    const frameAll = () => {
      const selectables = sceneStore.getAllUserObjects();
      const bs = computeBoundingSphere(selectables);
      if (!bs) return;
      const framing = frameSphere(bs, camera);
      smoothFrame(framing.position, framing.target);
    };

    const unregisterCommands = [
      commandBus.register({
        id: "edit.undo",
        title: "Undo",
        category: "Edit",
        shortcutLabel: "Ctrl+Z",
        isEnabled: () => undoStore.canUndo(),
        run: () => undoStore.undo(),
      }),
      commandBus.register({
        id: "edit.redo",
        title: "Redo",
        category: "Edit",
        shortcutLabel: "Ctrl+Y",
        isEnabled: () => undoStore.canRedo(),
        run: () => undoStore.redo(),
      }),
      commandBus.register({
        id: "gizmo.mode.translate",
        title: "Gizmo: Translate",
        category: "Viewport",
        shortcutLabel: "W",
        run: () => {
          gizmo.setMode("translate");
          onModeChange?.("translate");
        },
      }),
      commandBus.register({
        id: "gizmo.mode.rotate",
        title: "Gizmo: Rotate",
        category: "Viewport",
        shortcutLabel: "E",
        run: () => {
          gizmo.setMode("rotate");
          onModeChange?.("rotate");
        },
      }),
      commandBus.register({
        id: "gizmo.mode.scale",
        title: "Gizmo: Scale",
        category: "Viewport",
        shortcutLabel: "R",
        run: () => {
          gizmo.setMode("scale");
          onModeChange?.("scale");
        },
      }),
      commandBus.register({
        id: "selection.cancelOrClear",
        title: "Cancel Drag / Clear Selection",
        category: "Viewport",
        shortcutLabel: "Esc",
        run: () => {
          if (cancelDirectDrag()) {
            return;
          }
          if (gizmo.isDragging()) {
            gizmo.cancelDrag();
          } else {
            sceneStore.setSelectedId(null);
          }
        },
      }),
      commandBus.register({
        id: "timeline.keyAll",
        title: "Keyframe Transform",
        category: "Timeline",
        shortcutLabel: "K",
        run: () => {
          animationStore.addAllKeyframesForSelected({
            source: "shortcut",
            label: "Keyframe Transform",
          });
        },
      }),
      commandBus.register({
        id: "timeline.playPause",
        title: "Play/Pause",
        category: "Timeline",
        shortcutLabel: "Space",
        run: () => animationStore.togglePlayback(),
      }),
      commandBus.register({
        id: "viewport.frameSelected",
        title: "Frame Selected",
        category: "Viewport",
        shortcutLabel: "F",
        run: frameSelected,
      }),
      commandBus.register({
        id: "viewport.frameAll",
        title: "Frame All",
        category: "Viewport",
        shortcutLabel: "Shift+F",
        run: frameAll,
      }),
      commandBus.register({
        id: "viewport.toggleGrid",
        title: "Toggle Grid",
        category: "Viewport",
        shortcutLabel: "G",
        run: () => {
          gridVisible = !gridVisible;
          grid.visible = gridVisible;
          axes.visible = gridVisible;
        },
      }),
    ];

    // -- Keyboard shortcuts --
    function onKeyDown(e: KeyboardEvent) {
      const hasMod = e.metaKey || e.ctrlKey;
      const lower = e.key.toLowerCase();

      if (hasMod && lower === "z" && !e.shiftKey) {
        if (commandBus.execute("edit.undo")) {
          e.preventDefault();
        }
        return;
      }
      if (hasMod && (lower === "y" || (lower === "z" && e.shiftKey))) {
        if (commandBus.execute("edit.redo")) {
          e.preventDefault();
        }
        return;
      }

      switch (lower) {
        case "escape":
          commandBus.execute("selection.cancelOrClear");
          break;
        case "w":
          commandBus.execute("gizmo.mode.translate");
          break;
        case "e":
          commandBus.execute("gizmo.mode.rotate");
          break;
        case "r":
          commandBus.execute("gizmo.mode.scale");
          break;
        case "k":
          commandBus.execute("timeline.keyAll");
          break;
        case "f":
          commandBus.execute(e.shiftKey ? "viewport.frameAll" : "viewport.frameSelected");
          break;
        case "g":
          commandBus.execute("viewport.toggleGrid");
          break;
        case " ":
          if (commandBus.execute("timeline.playPause")) {
            e.preventDefault();
          }
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);

    // -- Resize --
    function resize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // -- Render loop --
    let frameId = 0;
    let fpsFrames = 0;
    let fps = 0;
    let lastFpsSample = performance.now();
    function animate() {
      frameId = requestAnimationFrame(animate);
      fpsFrames += 1;
      const now = performance.now();
      const delta = now - lastFpsSample;
      if (delta >= 500) {
        fps = Math.round((fpsFrames * 1000) / delta);
        fpsFrames = 0;
        lastFpsSample = now;
      }
      controls.update();
      gizmo.syncPosition();
      renderer.render(scene, camera);
    }
    animate();

    const statsTimer = window.setInterval(() => {
      if (!rendererStatsStore.getEnabled()) return;
      const next: RendererStatsSnapshot = {
        fps,
        drawCalls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
      rendererStatsStore.setStats(next);
      if (!rendererStatsStore.getEnabled()) {
        return;
      }
      setStats((prev) => (
        prev.fps === next.fps &&
        prev.drawCalls === next.drawCalls &&
        prev.geometries === next.geometries &&
        prev.textures === next.textures
          ? prev
          : next
      ));
    }, 500);

    // -- Cleanup --
    return () => {
      if (activeDirectDrag) {
        cancelDirectDrag();
      } else if (activeDirectDragPointerId !== null || pendingDirectDrag) {
        releasePointerCapture(activeDirectDragPointerId ?? pendingDirectDrag?.pointerId ?? null);
      }
      controls.enabled = true;
      cancelAnimationFrame(frameId);
      window.clearInterval(statsTimer);
      observer.disconnect();
      unsubSelection();
      unsubTransform();
      stopFrameTween();
      window.removeEventListener("keydown", onKeyDown);
      unregisterCommands.forEach((dispose) => dispose());
      renderer.domElement.removeEventListener("wheel", preventScroll);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      gizmo.dispose();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onModeChange]);

  return (
    <div className="viewport-root">
      <div ref={containerRef} className="viewport-canvas-host" />
      {statsEnabled && (
        <div className="viewport-stats" aria-label="Renderer stats overlay">
          <div>FPS: {stats.fps}</div>
          <div>Draw Calls: {stats.drawCalls}</div>
          <div>Geometries: {stats.geometries}</div>
          <div>Textures: {stats.textures}</div>
        </div>
      )}
    </div>
  );
}
