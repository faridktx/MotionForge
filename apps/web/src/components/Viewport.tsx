import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject } from "../lib/three/disposeObject.js";
import { raycastSelection } from "../lib/three/selection.js";
import { computeBoundingSphere, frameSphere } from "../lib/three/cameraFraming.js";
import { Gizmo, type GizmoMode } from "../lib/three/gizmo/Gizmo.js";
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

    // -- Click selection --
    let pointerDownPos = { x: 0, y: 0 };

    function onPointerDown(e: PointerEvent) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    }

    function onPointerUp(e: PointerEvent) {
      if (gizmo.isDragging()) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 9) return;
      if (e.button !== 0) return;

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
    renderer.domElement.addEventListener("pointerup", onPointerUp);

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
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
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
