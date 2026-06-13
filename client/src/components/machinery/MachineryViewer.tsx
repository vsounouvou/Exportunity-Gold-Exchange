import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { resolveApiUrl } from "@/lib/runtimeConfig";

type PreviewKind = "glb" | "stl";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; kind: PreviewKind }
  | { status: "loaded"; kind: PreviewKind; parts: string[] }
  | { status: "error"; message: string };

export function MachineryViewer(props: {
  revisionId: number | null;
  token: string | null;
  selectedPartId: string | null;
  onSelectPartId: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const rafRef = useRef<number | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const highlightedRef = useRef<string | null>(null);

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });

  const previewUrlBase = useMemo(() => {
    if (!props.revisionId) return null;
    return `/api/internal/engineering/revisions/${props.revisionId}/preview`;
  }, [props.revisionId]);

  const fetchPreview = async (kind: PreviewKind) => {
    if (!previewUrlBase) throw new Error("missing_revision");
    const url = resolveApiUrl(`${previewUrlBase}?kind=${encodeURIComponent(kind)}&v=${Date.now()}`);
    const headers: Record<string, string> = {};
    if (props.token) headers.Authorization = `Bearer ${props.token}`;
    const res = await fetch(url, { headers, credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error(`${kind.toUpperCase()} preview unavailable (${res.status})`);
    return res.arrayBuffer();
  };

  const fitCameraToObject = (camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = (camera.fov * Math.PI) / 180;
    const distance = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.6;

    camera.near = Math.max(0.01, distance / 200);
    camera.far = Math.max(1000, distance * 200);
    camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  };

  const setHighlightByName = (name: string | null) => {
    const root = modelRootRef.current;
    if (!root) return;
    if (highlightedRef.current === name) return;
    highlightedRef.current = name;

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m: any = mat;
        if (!m) continue;
        if (!m.emissive) continue;
        m.emissive.setHex(mesh.name === name ? 0x00bcd4 : 0x000000);
        m.emissiveIntensity = mesh.name === name ? 0.6 : 0.0;
        m.needsUpdate = true;
      }
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5000);
    camera.position.set(3, 2, 3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(6, 10, 7);
    scene.add(dir);

    const grid = new THREE.GridHelper(40, 40, 0x1c2433, 0x121a26);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);

    const root = new THREE.Group();
    root.name = "model_root";
    scene.add(root);
    modelRootRef.current = root;

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const handlePointerDown = (ev: PointerEvent) => {
      const rootLocal = modelRootRef.current;
      const cameraLocal = cameraRef.current;
      const rendererLocal = rendererRef.current;
      if (!rootLocal || !cameraLocal || !rendererLocal) return;

      const rect = rendererLocal.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      pointerRef.current.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

      raycasterRef.current.setFromCamera(pointerRef.current, cameraLocal);
      const hits = raycasterRef.current.intersectObjects(rootLocal.children, true);
      const hit = hits[0]?.object;
      const name = hit ? String(hit.name || hit.parent?.name || "") : "";
      const id = name.trim() ? name.trim() : null;
      props.onSelectPartId(id);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    return () => {
      try {
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      } catch {
        // ignore
      }
      try {
        ro.disconnect();
      } catch {
        // ignore
      }
      try {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } catch {
        // ignore
      }
      try {
        controls.dispose();
      } catch {
        // ignore
      }
      try {
        renderer.dispose();
      } catch {
        // ignore
      }
      try {
        container.removeChild(renderer.domElement);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    setHighlightByName(props.selectedPartId);
  }, [props.selectedPartId]);

  useEffect(() => {
    const root = modelRootRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!root || !scene || !camera || !controls) return;

    let cancelled = false;

    const clearRoot = () => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) mat?.dispose?.();
          mesh.geometry?.dispose?.();
        }
      });
      while (root.children.length) root.remove(root.children[0]);
      highlightedRef.current = null;
      props.onSelectPartId(null);
    };

    const load = async () => {
      if (!props.revisionId) {
        clearRoot();
        setLoadState({ status: "idle" });
        return;
      }

      clearRoot();
      setLoadState({ status: "loading", kind: "glb" });

      const parts: string[] = [];

      const tryLoadGlb = async () => {
        const data = await fetchPreview("glb");
        if (cancelled) return null;
        const loader = new GLTFLoader();
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.parse(
            data,
            "",
            (result) => resolve(result),
            (err) => reject(err instanceof Error ? err : new Error("glb_parse_failed")),
          );
        });
        if (cancelled) return null;
        const obj = gltf.scene as THREE.Object3D;
        obj.traverse((o: any) => {
          if (o?.isMesh) {
            o.castShadow = false;
            o.receiveShadow = true;
          }
          if (o?.name) parts.push(String(o.name));
        });
        return { kind: "glb" as const, object: obj, parts: Array.from(new Set(parts)).filter(Boolean) };
      };

      const tryLoadStl = async () => {
        const data = await fetchPreview("stl");
        if (cancelled) return null;
        const loader = new STLLoader();
        const geometry = loader.parse(data);
        const material = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, roughness: 0.75, metalness: 0.15 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = "stl_model";
        return { kind: "stl" as const, object: mesh, parts: ["stl_model"] };
      };

      try {
        const glbResult = await tryLoadGlb();
        if (cancelled || !glbResult) return;
        root.add(glbResult.object);
        fitCameraToObject(camera, controls, root);
        setLoadState({ status: "loaded", kind: glbResult.kind, parts: glbResult.parts });
        return;
      } catch (err: any) {
        if (cancelled) return;
        setLoadState({ status: "loading", kind: "stl" });
      }

      try {
        const stlResult = await tryLoadStl();
        if (cancelled || !stlResult) return;
        root.add(stlResult.object);
        fitCameraToObject(camera, controls, root);
        setLoadState({ status: "loaded", kind: stlResult.kind, parts: stlResult.parts });
        return;
      } catch (err: any) {
        if (cancelled) return;
        setLoadState({ status: "error", message: String(err?.message || "preview_load_failed") });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [previewUrlBase, props.revisionId, props.token]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        {loadState.status === "loading" ? (
          <span className="text-[10px] rounded-full bg-white/10 border border-white/15 text-white/70 px-2 py-1">
            Loading {loadState.kind.toUpperCase()}?
          </span>
        ) : null}
        {loadState.status === "loaded" ? (
          <span className="text-[10px] rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-200 px-2 py-1">
            Preview {loadState.kind.toUpperCase()}
          </span>
        ) : null}
        {loadState.status === "error" ? (
          <span className="text-[10px] rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-200 px-2 py-1">
            {loadState.message}
          </span>
        ) : null}
      </div>
      <div className="absolute bottom-2 right-2 z-10 text-[10px] text-white/45 bg-black/40 border border-white/10 rounded-lg px-2 py-1">
        Drag to orbit ? Scroll to zoom
      </div>
    </div>
  );
}

