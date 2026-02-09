import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject } from "../lib/three/disposeObject.js";
import { raycastSelection } from "../lib/three/selection.js";
import { computeBoundingSphere, frameSphere } from "../lib/three/cameraFraming.js";
import { Gizmo, type GizmoMode } from "../lib/three/gizmo/Gizmo.js";
import { sceneStore } from "../state/sceneStore.js";
import { undoStore } from "../state/undoStore.js";
import { animationStore } from "../state/animationStore.js";
import { createDefaultObjects } from "../lib/project/deserialize.js";

const HIGHLIGHT_EMISSIVE = new THREE.Color(0x335599);
const DEFAULT_EMISSIVE = new THREE.Color(0x000000);

interface GizmoModeCallback {
  (mode: GizmoMode): void;
}

let gizmoModeCallback: GizmoModeCallback | null = null;

/** Called by external components to get gizmo mode updates. */
export function onGizmoModeChange(cb: GizmoModeCallback | null) {
  gizmoModeCallback = cb;
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);

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
    const dragStartRot = new THREE.Euler();
    const dragStartScale = new THREE.Vector3();

    const gizmo = new Gizmo(camera, renderer.domElement, {
      onDragStart() {
        controls.enabled = false;
        const obj = sceneStore.getSelectedObject();
        if (obj) {
          dragStartPos.copy(obj.position);
          dragStartRot.copy(obj.rotation);
          dragStartScale.copy(obj.scale);
        }
      },
      onDrag() {
        sceneStore.notifyTransformChanged();
      },
      onDragEnd() {
        controls.enabled = true;
        const obj = sceneStore.getSelectedObject();
        if (obj) {
          const endPos = obj.position.clone();
          const endRot = obj.rotation.clone();
          const endScale = obj.scale.clone();
          const startP = dragStartPos.clone();
          const startR = dragStartRot.clone();
          const startS = dragStartScale.clone();
          const ref = obj;
          undoStore.pushExecuted({
            label: `Gizmo ${gizmo.getMode()}`,
            execute() {
              ref.position.copy(endPos);
              ref.rotation.copy(endRot);
              ref.scale.copy(endScale);
              gizmo.syncPosition();
              sceneStore.notifyTransformChanged();
            },
            undo() {
              ref.position.copy(startP);
              ref.rotation.copy(startR);
              ref.scale.copy(startS);
              gizmo.syncPosition();
              sceneStore.notifyTransformChanged();
            },
          });
        }
      },
      onCancel() {
        controls.enabled = true;
        sceneStore.notifyTransformChanged();
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
      if (obj instanceof THREE.Mesh) {
        setHighlight(obj);
        gizmo.attach(obj);
      } else {
        setHighlight(null);
        gizmo.detach();
      }
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

    // -- Keyboard shortcuts --
    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;

      // Undo/redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoStore.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || e.key === "y")) {
        e.preventDefault();
        undoStore.redo();
        return;
      }

      switch (e.key) {
        case "Escape": {
          if (gizmo.isDragging()) {
            gizmo.cancelDrag();
          } else {
            sceneStore.setSelectedId(null);
          }
          break;
        }
        case "w": {
          gizmo.setMode("translate");
          gizmoModeCallback?.("translate");
          break;
        }
        case "e": {
          gizmo.setMode("rotate");
          gizmoModeCallback?.("rotate");
          break;
        }
        case "r": {
          gizmo.setMode("scale");
          gizmoModeCallback?.("scale");
          break;
        }
        case "k": {
          animationStore.addKeyframesForSelected("position");
          animationStore.addKeyframesForSelected("rotation");
          animationStore.addKeyframesForSelected("scale");
          break;
        }
        case "f": {
          const selectables = sceneStore.getAllUserObjects();
          if (e.shiftKey) {
            const bs = computeBoundingSphere(selectables);
            if (bs) {
              const framing = frameSphere(bs, camera);
              camera.position.copy(framing.position);
              controls.target.copy(framing.target);
            }
          } else {
            const sel = sceneStore.getSelectedObject();
            if (sel) {
              const bs = computeBoundingSphere([sel]);
              if (bs) {
                const framing = frameSphere(bs, camera);
                camera.position.copy(framing.position);
                controls.target.copy(framing.target);
              }
            } else {
              controls.target.set(0, 0, 0);
              camera.position.set(4, 3, 4);
            }
          }
          break;
        }
        case "g": {
          gridVisible = !gridVisible;
          grid.visible = gridVisible;
          axes.visible = gridVisible;
          break;
        }
        case " ": {
          e.preventDefault();
          animationStore.togglePlayback();
          break;
        }
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
    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      gizmo.syncPosition();
      renderer.render(scene, camera);
    }
    animate();

    // -- Cleanup --
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      unsubSelection();
      unsubTransform();
      window.removeEventListener("keydown", onKeyDown);
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
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
