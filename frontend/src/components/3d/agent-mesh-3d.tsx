"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Flame, RotateCw, Eye, KeyRound } from "lucide-react";
import confetti from "canvas-confetti";

interface AgentNode3D {
  id: string;
  name: string;
  role: string;
  status: "verified" | "attacking" | "attenuated" | "monitoring";
  pos: [number, number, number];
  color: number;
}

const AGENTS_DATA: AgentNode3D[] = [
  { id: "planner", name: "Root Planner Agent", role: "Issuer (Ed25519)", status: "verified", pos: [2.8, 1.2, 1.0], color: 0x4f46e5 },
  { id: "analyst", name: "Market Analyst Node", role: "Hop 1 (Caveat Scoped)", status: "verified", pos: [-2.6, 1.8, -1.2], color: 0x059669 },
  { id: "db_writer", name: "Database Writer", role: "Hop 2 (Strict TTL)", status: "attenuated", pos: [1.4, -2.2, 2.0], color: 0xd97706 },
  { id: "sentinel", name: "Groq Sentinel LPU", role: "Layer 6 Guard", status: "monitoring", pos: [-1.8, -2.0, -1.8], color: 0x4f46e5 },
  { id: "adversary", name: "Adversarial Injector", role: "Untrusted Ext", status: "attacking", pos: [3.2, -1.0, -1.5], color: 0xe11d48 },
];

export function AgentMesh3D({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredAgent, setHoveredAgent] = useState<AgentNode3D | null>(null);
  const [attackActive, setAttackActive] = useState<boolean>(false);
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.004);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodesGroupRef = useRef<THREE.Group | null>(null);
  const packetsGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 8.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x4f46e5, 1.8);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xd97706, 1.2);
    dirLight2.position.set(-5, -8, -5);
    scene.add(dirLight2);

    // Center Core: 3D Holographic Geometric Security Engine
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // Inner glowing icosahedron
    const coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      roughness: 0.2,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreGroup.add(coreMesh);

    // Solid inner core
    const innerGeo = new THREE.SphereGeometry(0.75, 24, 24);
    const innerMat = new THREE.MeshPhysicalMaterial({
      color: 0x6366f1,
      emissive: 0x4338ca,
      emissiveIntensity: 0.4,
      roughness: 0.1,
      metalness: 0.2,
      transmission: 0.4,
      thickness: 0.5,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(innerSphere);

    // Orbital Rings
    const ringGeo1 = new THREE.TorusGeometry(2.4, 0.02, 16, 100);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x059669, transparent: true, opacity: 0.35 });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 3;
    scene.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(3.2, 0.02, 16, 100);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x4f46e5, transparent: true, opacity: 0.25 });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);

    // Agent Nodes Group
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);
    nodesGroupRef.current = nodesGroup;

    const nodeMeshes: THREE.Mesh[] = [];

    AGENTS_DATA.forEach((agent) => {
      const nodeGeo = new THREE.SphereGeometry(0.32, 24, 24);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: agent.color,
        emissive: agent.color,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.4,
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.set(...agent.pos);
      nodeMesh.userData = { agentData: agent };
      nodesGroup.add(nodeMesh);
      nodeMeshes.push(nodeMesh);

      // Node Halo / Wireframe Outer Sphere
      const haloGeo = new THREE.SphereGeometry(0.44, 12, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color: agent.color,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(...agent.pos);
      nodesGroup.add(halo);
    });

    // Connecting Beams & Laser Packets
    const packetsGroup = new THREE.Group();
    scene.add(packetsGroup);
    packetsGroupRef.current = packetsGroup;

    const linesMat = new THREE.LineBasicMaterial({ color: 0x4f46e5, transparent: true, opacity: 0.28 });
    AGENTS_DATA.forEach((agent, i) => {
      const nextAgent = AGENTS_DATA[(i + 1) % AGENTS_DATA.length];
      const points = [
        new THREE.Vector3(...agent.pos),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(...nextAgent.pos),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, linesMat);
      packetsGroup.add(line);
    });

    // Raycasting for Mouse Hover Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes);

      if (intersects.length > 0) {
        const agent = intersects[0].object.userData.agentData as AgentNode3D;
        setHoveredAgent(agent);
        document.body.style.cursor = "pointer";
      } else {
        setHoveredAgent(null);
        document.body.style.cursor = "default";
      }
    };

    container.addEventListener("mousemove", handleMouseMove);

    // Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Rotate core
      coreGroup.rotation.y = elapsedTime * 0.4;
      coreGroup.rotation.x = Math.sin(elapsedTime * 0.3) * 0.2;

      // Orbit entire mesh
      nodesGroup.rotation.y += rotationSpeed;
      packetsGroup.rotation.y += rotationSpeed;

      // Pulse rings
      ring1.rotation.z = elapsedTime * 0.15;
      ring2.rotation.z = -elapsedTime * 0.2;

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [rotationSpeed]);

  function triggerAttackBurst() {
    setAttackActive(true);
    setRotationSpeed(0.015);

    confetti({
      particleCount: 45,
      spread: 60,
      origin: { y: 0.6 },
      colors: ["#4F46E5", "#059669", "#E11D48", "#D97706"],
    });

    setTimeout(() => {
      setAttackActive(false);
      setRotationSpeed(0.004);
    }, 2500);
  }

  return (
    <div className={`relative rounded-2xl border border-hairline-strong bg-surface p-4 sm:p-6 shadow-card overflow-hidden ${className}`}>
      {/* 3D Viewport Controls & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline relative z-10">
        <div>
          <div className="eyebrow flex items-center gap-2 mb-0.5">
            <span className="h-2 w-2 rounded-full bg-allow animate-pulse glow-allow" />
            <span>Interactive 3D Zero-Trust Mesh</span>
          </div>
          <h3 className="text-[16px] font-bold text-ink-primary flex items-center gap-2">
            <span>Agent Governance Sphere</span>
            <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25">
              WebGL 3D Orbit
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerAttackBurst}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-mono font-semibold transition-all shadow-sm ${
              attackActive
                ? "bg-block text-white glow-block animate-pulse"
                : "bg-surface-elevated text-ink-primary hover:bg-surface-highlight border border-hairline-strong"
            }`}
          >
            <Flame size={13} className={attackActive ? "text-white" : "text-review"} />
            {attackActive ? "Firewall Intercepting..." : "Simulate 3D Attack Wave"}
          </button>
          <button
            onClick={() => setRotationSpeed((s) => (s > 0.008 ? 0.004 : 0.012))}
            className="p-1.5 rounded-xl bg-surface-elevated hover:bg-surface-highlight border border-hairline text-ink-muted hover:text-ink-primary transition-colors"
            title="Toggle 3D Orbit Speed"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Viewport */}
      <div className="relative w-full h-[360px] sm:h-[420px] rounded-xl overflow-hidden bg-gradient-to-b from-surface-sunken/40 via-surface/60 to-surface-elevated/40 border border-hairline my-3">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* 3D Overlay Guidance */}
        <div className="absolute top-3 left-3 pointer-events-none z-10 flex items-center gap-2 text-[11px] font-mono text-ink-muted bg-surface/85 px-2.5 py-1 rounded-lg border border-hairline backdrop-blur-md shadow-sm">
          <Eye size={12} className="text-accent" />
          <span>Hover any 3D node to inspect agent identity</span>
        </div>

        {/* Live Hover Info Popover Card */}
        {hoveredAgent && (
          <div className="absolute bottom-4 left-4 z-20 w-72 rounded-xl bg-surface/95 border border-hairline-strong p-3.5 shadow-popover backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12.5px] font-bold text-ink-primary flex items-center gap-1.5">
                <KeyRound size={13} className="text-accent" />
                {hoveredAgent.name}
              </span>
              <span
                className={`text-[9.5px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                  hoveredAgent.status === "verified"
                    ? "bg-allow/15 text-allow border border-allow/30"
                    : hoveredAgent.status === "attacking"
                    ? "bg-block/15 text-block border border-block/30"
                    : "bg-review/15 text-review border border-review/30"
                }`}
              >
                {hoveredAgent.status}
              </span>
            </div>

            <div className="text-[11px] font-mono text-ink-muted space-y-1 bg-surface-sunken p-2 rounded-lg border border-hairline">
              <div>Role: <span className="text-ink-primary font-medium">{hoveredAgent.role}</span></div>
              <div>Node ID: <span className="text-accent font-semibold">{hoveredAgent.id}</span></div>
              <div>Ed25519 Key: <span className="text-allow">Verified & Monitored</span></div>
            </div>
          </div>
        )}
      </div>

      {/* 3D Mesh Legend Footer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-hairline text-[11.5px] font-mono">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated border border-hairline">
          <div className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="text-ink-primary font-medium">Root Key Issuer</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated border border-hairline">
          <div className="h-2.5 w-2.5 rounded-full bg-allow" />
          <span className="text-ink-primary font-medium">Attenuated Hop</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated border border-hairline">
          <div className="h-2.5 w-2.5 rounded-full bg-review" />
          <span className="text-ink-primary font-medium">Caveat Restricted</span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated border border-hairline">
          <div className="h-2.5 w-2.5 rounded-full bg-block" />
          <span className="text-ink-primary font-medium">Quarantined Threat</span>
        </div>
      </div>
    </div>
  );
}
