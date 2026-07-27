import { useEffect, useRef, useState } from "react";
import { Expand, Info, Rotate3D, ZoomIn } from "lucide-react";

import { MobilityLayout, PageHeader, trackMobilityEvent, useMobilityMeta } from "./mobility-core";

type CameraPreset = "exterior" | "front" | "side" | "interior" | "driver" | "passengers";

const presets: Array<{ id: CameraPreset; label: string }> = [
  { id: "exterior", label: "Vue extérieure" },
  { id: "front", label: "Face avant" },
  { id: "side", label: "Vue latérale" },
  { id: "interior", label: "Intérieur" },
  { id: "driver", label: "Poste de conduite" },
  { id: "passengers", label: "Espace passagers" },
];

const hotspots = [
  ["driver", "Poste de conduite", "Commandes, visibilité et instrumentation du conducteur."],
  ["entry", "Accès passagers", "Embarquement ouvert et circulation facilitée selon la configuration."],
  ["seats", "Zone passagers", "Disposition adaptable au service urbain, interurbain ou privé."],
  ["accessibility", "Accessibilité", "Emplacement et équipements à valider selon la version finale."],
  ["charging", "Port de recharge", "Interface de recharge représentée à titre démonstratif."],
  ["battery", "Système d'énergie", "Architecture batterie et autonomie à confirmer par l'ingénierie."],
  ["dashboard", "Tableau de bord", "Informations véhicule et suivi opérationnel."],
  ["safety", "Sécurité", "Équipements et procédures à définir selon l'homologation."],
  ["technology", "Technologie embarquée", "Préparation pour information voyageur et supervision de flotte."],
] as const;

export function AgoojiyeThreeExperiencePage() {
  useMobilityMeta("Expérience 3D", "Explorez une maquette 3D interactive du bus électrique AGOOJIYE.");
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "reduced">("loading");
  const [preset, setPreset] = useState<CameraPreset>("exterior");
  const [hotspot, setHotspot] = useState<(typeof hotspots)[number] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    trackMobilityEvent("3d_experience_opened", { model: "procedural-placeholder" });
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let rendererInstance: any = null;
    const cleanupFns: Array<() => void> = [];
    const loadTimeout = window.setTimeout(() => {
      if (!disposed) setStatus("error");
    }, 12_000);
    (async () => {
      try {
        const THREE: any = await import("three");
        if (disposed) return;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111412);
        scene.fog = new THREE.Fog(0x111412, 18, 35);
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        rendererInstance = renderer;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.shadowMap.enabled = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);
        renderer.domElement.setAttribute("aria-label", "Maquette 3D interactive du bus AGOOJIYE");
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "none";

        scene.add(new THREE.HemisphereLight(0xfff8e8, 0x2b332e, 2.1));
        const key = new THREE.DirectionalLight(0xffffff, 3.4);
        key.position.set(8, 12, 7);
        key.castShadow = true;
        scene.add(key);
        const goldLight = new THREE.PointLight(0xd6a82e, 35, 20);
        goldLight.position.set(-5, 4, -3);
        scene.add(goldLight);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x252925, roughness: 0.92, metalness: 0.08 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.62;
        floor.receiveShadow = true;
        scene.add(floor);
        const grid = new THREE.GridHelper(50, 50, 0x6b5b2d, 0x343a35);
        grid.position.y = -1.6;
        scene.add(grid);

        // Procedural placeholder: replace through AGOOJIYE_3D_MODEL_URL when a validated GLB is supplied.
        const bus = new THREE.Group();
        const black = new THREE.MeshStandardMaterial({ color: 0x141716, roughness: 0.42, metalness: 0.55 });
        const silver = new THREE.MeshStandardMaterial({ color: 0xa5aaa6, roughness: 0.38, metalness: 0.72 });
        const gold = new THREE.MeshStandardMaterial({ color: 0xd6a82e, roughness: 0.34, metalness: 0.78 });
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x7ea89b, transparent: true, opacity: 0.34, roughness: 0.08, metalness: 0.05, transmission: 0.24 });
        const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x202321, roughness: 0.8 });

        const lower = new THREE.Mesh(new THREE.BoxGeometry(8.7, 1.1, 3.25), silver);
        lower.position.y = -0.58;
        lower.castShadow = true;
        bus.add(lower);
        const front = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.55, 3.1), black);
        front.position.set(-4.02, 0.22, 0);
        front.rotation.z = -0.08;
        front.castShadow = true;
        bus.add(front);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.22, 3.45), silver);
        roof.position.y = 1.63;
        roof.castShadow = true;
        bus.add(roof);
        for (const x of [-3.4, -1.6, 0.2, 2, 3.8]) {
          for (const z of [-1.48, 1.48]) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.55, 0.18), black);
            pillar.position.set(x, 0.4, z);
            bus.add(pillar);
          }
        }
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 2.65), glass);
        windshield.position.set(-4.72, 0.55, 0);
        windshield.rotation.z = -0.08;
        bus.add(windshield);
        for (const z of [-1.4, 1.4]) {
          const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.55, 0.06), glass);
          sideGlass.position.set(0.3, 0.55, z);
          bus.add(sideGlass);
        }
        for (const x of [-2.65, -0.85, 0.95, 2.75]) {
          for (const z of [-0.82, 0.82]) {
            const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.65), seatMaterial);
            seatBase.position.set(x, -0.2, z);
            const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.92, 0.65), seatMaterial);
            seatBack.position.set(x + 0.28, 0.22, z);
            bus.add(seatBase, seatBack);
          }
        }
        for (const x of [-3.05, 3.05]) {
          for (const z of [-1.58, 1.58]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.38, 28), black);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(x, -0.95, z);
            wheel.castShadow = true;
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.4, 20), gold);
            hub.rotation.x = Math.PI / 2;
            hub.position.copy(wheel.position);
            bus.add(wheel, hub);
          }
        }
        for (const z of [-0.9, 0.9]) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.12), new THREE.MeshStandardMaterial({ color: 0xe9f8ff, emissive: 0xbfeaff, emissiveIntensity: 4 }));
          lamp.position.set(-4.72, -0.15, z);
          lamp.rotation.x = Math.PI / 8;
          bus.add(lamp);
        }
        const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), gold);
        badge.rotation.z = Math.PI / 2;
        badge.position.set(-4.75, -0.38, 0);
        bus.add(badge);
        scene.add(bus);

        const presetValues: Record<CameraPreset, { camera: [number, number, number]; target: [number, number, number]; busY: number }> = {
          exterior: { camera: [10, 5.2, 10], target: [0, 0, 0], busY: -0.38 },
          front: { camera: [-13, 2.5, 0.2], target: [-1, 0, 0], busY: 0 },
          side: { camera: [0, 2.8, 14], target: [0, 0, 0], busY: 0 },
          interior: { camera: [-1.6, 0.65, 0], target: [3.1, 0.25, 0], busY: 0 },
          driver: { camera: [-3.35, 0.62, 0.45], target: [-4.6, 0.2, 0], busY: 0 },
          passengers: { camera: [2.8, 0.72, 0], target: [-1.8, 0.1, 0], busY: 0 },
        };
        const applyPreset = (name: CameraPreset) => {
          const value = presetValues[name];
          const target = new THREE.Vector3(...value.target);
          const position = new THREE.Vector3(...value.camera);
          if (camera.aspect < 1 && ["exterior", "front", "side"].includes(name)) {
            const mobileFramingScale = Math.min(1.45, 1 + (1 - camera.aspect) * 1.2);
            position.sub(target).multiplyScalar(mobileFramingScale).add(target);
          }
          camera.position.copy(position);
          camera.lookAt(...value.target);
          bus.rotation.y = value.busY;
        };
        applyPreset("exterior");

        let dragging = false;
        let previousX = 0;
        let previousY = 0;
        const onPointerDown = (event: PointerEvent) => { dragging = true; previousX = event.clientX; previousY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
        const onPointerMove = (event: PointerEvent) => { if (!dragging || ["interior", "driver", "passengers"].includes(runtimeRef.current?.preset)) return; const dx = event.clientX - previousX; const dy = event.clientY - previousY; bus.rotation.y += dx * 0.008; bus.rotation.x = Math.max(-0.18, Math.min(0.18, bus.rotation.x + dy * 0.002)); previousX = event.clientX; previousY = event.clientY; };
        const onPointerUp = () => { dragging = false; };
        const onWheel = (event: WheelEvent) => { event.preventDefault(); const direction = camera.position.clone().normalize(); camera.position.add(direction.multiplyScalar(event.deltaY * 0.006)); const distance = camera.position.length(); if (distance < 3.2) camera.position.setLength(3.2); if (distance > 22) camera.position.setLength(22); };
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        renderer.domElement.addEventListener("pointercancel", onPointerUp);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        cleanupFns.push(() => renderer.domElement.removeEventListener("pointerdown", onPointerDown), () => renderer.domElement.removeEventListener("pointermove", onPointerMove), () => renderer.domElement.removeEventListener("pointerup", onPointerUp), () => renderer.domElement.removeEventListener("pointercancel", onPointerUp), () => renderer.domElement.removeEventListener("wheel", onWheel));

        const resize = () => {
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          applyPreset(runtimeRef.current?.preset || "exterior");
          renderer.setSize(width, height, false);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        runtimeRef.current = { scene, camera, renderer, bus, applyPreset, preset: "exterior" };
        const render = () => {
          if (disposed) return;
          if (!reducedMotion && runtimeRef.current?.preset === "exterior" && !dragging) bus.rotation.y += 0.0012;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        render();
        window.clearTimeout(loadTimeout);
        setStatus(reducedMotion ? "reduced" : "ready");
      } catch {
        window.clearTimeout(loadTimeout);
        if (!disposed) setStatus("error");
      }
    })();
    return () => {
      disposed = true;
      window.clearTimeout(loadTimeout);
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      cleanupFns.forEach((cleanup) => cleanup());
      if (rendererInstance) {
        rendererInstance.dispose();
        if (rendererInstance.domElement.parentNode === host) host.removeChild(rendererInstance.domElement);
      }
      if (runtimeRef.current?.renderer === rendererInstance) runtimeRef.current = null;
    };
  }, [attempt]);

  const selectPreset = (value: CameraPreset) => {
    setPreset(value);
    if (runtimeRef.current) {
      runtimeRef.current.preset = value;
      runtimeRef.current.applyPreset(value);
    }
  };

  const toggleFullscreen = () => {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else host.requestFullscreen?.();
  };

  const retry = () => {
    setStatus("loading");
    setAttempt((value) => value + 1);
  };

  return <MobilityLayout active="/experience-3d"><PageHeader eyebrow="Exploration interactive" title="Visitez le bus AGOOJIYE en 3D" description="Maquette procédurale de démonstration. Le modèle d'ingénierie final pourra la remplacer avec une seule URL de configuration." /><section className="bg-[#111412] text-white"><div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6"><div className="flex flex-wrap gap-2 py-4" role="group" aria-label="Vues de la caméra">{presets.map((item) => <button key={item.id} type="button" onClick={() => selectPreset(item.id)} className={`min-h-10 border px-3 text-sm font-bold ${preset === item.id ? "border-[#e0b84f] bg-[#e0b84f] text-[#111]" : "border-white/20 text-white"}`}>{item.label}</button>)}<button type="button" onClick={toggleFullscreen} className="ml-auto inline-flex min-h-10 items-center gap-2 border border-white/20 px-3 text-sm font-bold"><Expand size={17} />Plein écran</button></div><div className="relative h-[58vh] min-h-[440px] max-h-[760px] overflow-hidden border border-white/10 bg-[#111412]" ref={hostRef} aria-busy={status === "loading"}>{status === "loading" || status === "error" ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#111412] p-4 text-center"><div><img src="/brand/agoojiye/vehicle/sections/agoojiye-shuttle-side-profile-1280.webp" alt="Aperçu statique du bus AGOOJIYE" width={1280} height={853} className="mx-auto max-h-[320px] max-w-full object-contain" /><p className="mt-4 text-sm text-white/70">{status === "loading" ? "Chargement de l'expérience 3D…" : "La 3D n'est pas disponible pour le moment. L'aperçu statique reste accessible."}</p>{status === "error" ? <button type="button" onClick={retry} className="mt-4 min-h-11 border border-[#e0b84f] px-4 text-sm font-bold text-[#e0b84f]">Réessayer la 3D</button> : null}</div></div> : null}</div><div className="mt-4 flex flex-wrap gap-5 text-xs text-white/55"><span className="flex items-center gap-2"><Rotate3D size={16} />Glissez pour tourner</span><span className="flex items-center gap-2"><ZoomIn size={16} />Faites défiler pour zoomer</span>{status === "reduced" ? <span>Mouvement automatique désactivé</span> : null}</div></div></section><section className="bg-[#f5f3ee]"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_360px]"><div><p className="text-xs font-bold uppercase text-[#805f12]">Points d'intérêt</p><h2 className="mt-2 text-3xl font-bold">Comprendre le bus</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{hotspots.map((item) => <button key={item[0]} type="button" onClick={() => setHotspot(item)} className="flex min-h-14 items-center justify-between border border-black/10 bg-white px-4 text-left font-bold hover:border-[#15803d]"><span>{item[1]}</span><Info size={18} className="text-[#15803d]" /></button>)}</div></div><aside className="h-fit bg-white p-6"><h3 className="text-xl font-bold">{hotspot?.[1] || "Sélectionnez un point"}</h3><p className="mt-3 text-sm leading-6 text-black/60">{hotspot?.[2] || "Explorez les zones du véhicule pour afficher une information concise."}</p><div className="mt-6 border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><strong>Maquette remplaçable.</strong> Aucun modèle d'ingénierie final n'a été trouvé dans le dépôt. Ajoutez le GLB validé via <code>AGOOJIYE_3D_MODEL_URL</code>.</div></aside></div></section></MobilityLayout>;
}
