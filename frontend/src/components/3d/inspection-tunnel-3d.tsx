"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Play, RotateCcw, ShieldCheck, Flame, Zap } from "lucide-react";
import confetti from "canvas-confetti";

interface GateDef {
  id: number;
  name: string;
  z: number;
  color: number;
}

const GATES: GateDef[] = [
  { id: 1, name: "L1: Rate Limiter", z: 6, color: 0x4f46e5 },
  { id: 2, name: "L2: Preflight & Nonce", z: 3.5, color: 0x4f46e5 },
  { id: 3, name: "L3: Schema Validator", z: 1.0, color: 0x4f46e5 },
  { id: 4, name: "L4: Permissions RBAC", z: -1.5, color: 0x4f46e5 },
  { id: 5, name: "L5: Rule & Caveats", z: -4.0, color: 0x4f46e5 },
  { id: 6, name: "L6: Groq Semantic Guard", z: -6.5, color: 0x4f46e5 },
];

export function InspectionTunnel3D({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeVerdict, setActiveVerdict] = useState<"clean" | "injection" | "privesc" | "replay">("clean");
  const [running, setRunning] = useState<boolean>(false);
  const [currentGateIndex, setCurrentGateIndex] = useState<number>(0);

  const packetMeshRef = useRef<THREE.Mesh | null>(null);
  const ringMeshesRef = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.2, 10.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x4f46e5, 2.5, 30);
    pointLight.position.set(0, 3, 5);
    scene.add(pointLight);

    // Tunnel Cylinder Wireframe
    const tunnelGeo = new THREE.CylinderGeometry(2.6, 2.6, 20, 24, 20, true);
    const tunnelMat = new THREE.MeshBasicMaterial({
      color: 0xd97706,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = -0.5;
    scene.add(tunnel);

    // 6 Holographic Gate Rings
    const ringMeshes: THREE.Mesh[] = [];
    GATES.forEach((gate) => {
      const torusGeo = new THREE.TorusGeometry(2.3, 0.06, 16, 64);
      const torusMat = new THREE.MeshStandardMaterial({
        color: 0x4f46e5,
        emissive: 0x4f46e5,
        emissiveIntensity: 0.5,
        roughness: 0.2,
      });
      const ring = new THREE.Mesh(torusGeo, torusMat);
      ring.position.z = gate.z;
      scene.add(ring);
      ringMeshes.push(ring);

      // Inner subtle disk
      const diskGeo = new THREE.CircleGeometry(2.2, 32);
      const diskMat = new THREE.MeshBasicMaterial({
        color: 0x4f46e5,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
      });
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.position.z = gate.z;
      scene.add(disk);
    });
    ringMeshesRef.current = ringMeshes;

    // Moving Packet Sphere
    const packetGeo = new THREE.SphereGeometry(0.35, 24, 24);
    const packetMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x059669,
      emissiveIntensity: 0.8,
      roughness: 0.1,
    });
    const packet = new THREE.Mesh(packetGeo, packetMat);
    packet.position.set(0, 0, 8.5);
    scene.add(packet);
    packetMeshRef.current = packet;

    // Animation Loop
    let animationFrameId: number;
    let packetZ = 8.5;
    let targetZ = -8.5;
    let packetColor = 0x059669;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Rotate tunnel slowly
      tunnel.rotation.y += 0.003;

      // Animate packet if running
      if (packetMeshRef.current) {
        if (packetZ > targetZ) {
          packetZ -= 0.08;
          packetMeshRef.current.position.z = packetZ;
          packetMeshRef.current.position.x = Math.sin(packetZ * 1.2) * 0.3;
          packetMeshRef.current.position.y = Math.cos(packetZ * 1.2) * 0.3;

          // Check which gate the packet is passing
          GATES.forEach((gate, idx) => {
            if (Math.abs(packetZ - gate.z) < 0.4) {
              setCurrentGateIndex(idx);
              const ringMat = ringMeshes[idx].material as THREE.MeshStandardMaterial;
              ringMat.emissive.setHex(packetColor);
              ringMat.emissiveIntensity = 1.2;
            } else {
              const ringMat = ringMeshes[idx].material as THREE.MeshStandardMaterial;
              ringMat.emissiveIntensity = 0.4;
            }
          });
        }
      }

      renderer.render(scene, camera);
    };

    animate();

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
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  function launchPacket(type: "clean" | "injection" | "privesc" | "replay") {
    setActiveVerdict(type);
    setRunning(true);

    if (!packetMeshRef.current) return;
    packetMeshRef.current.position.set(0, 0, 8.5);

    const mat = packetMeshRef.current.material as THREE.MeshStandardMaterial;
    if (type === "clean") {
      mat.color.setHex(0x059669);
      mat.emissive.setHex(0x059669);
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
        colors: ["#059669", "#4F46E5", "#D97706"],
      });
    } else {
      mat.color.setHex(0xe11d48);
      mat.emissive.setHex(0xe11d48);
    }
  }

  return (
    <div className={`rounded-2xl border border-hairline-strong bg-surface p-4 sm:p-6 shadow-card ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
        <div>
          <div className="eyebrow flex items-center gap-2 mb-0.5">
            <Zap size={13} className="text-accent" />
            <span>3D Inspection Flow Tunnel</span>
          </div>
          <h3 className="text-[16px] font-bold text-ink-primary">
            Sequential 6-Layer Packet Telemetry
          </h3>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-surface-sunken border border-hairline">
          <button
            onClick={() => launchPacket("clean")}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono font-medium transition-all ${
              activeVerdict === "clean"
                ? "bg-allow text-white shadow-sm font-semibold"
                : "text-ink-muted hover:text-ink-primary"
            }`}
          >
            Authorized (Pass All)
          </button>
          <button
            onClick={() => launchPacket("injection")}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono font-medium transition-all ${
              activeVerdict === "injection"
                ? "bg-block text-white shadow-sm font-semibold"
                : "text-ink-muted hover:text-ink-primary"
            }`}
          >
            Prompt Injection
          </button>
          <button
            onClick={() => launchPacket("replay")}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono font-medium transition-all ${
              activeVerdict === "replay"
                ? "bg-block text-white shadow-sm font-semibold"
                : "text-ink-muted hover:text-ink-primary"
            }`}
          >
            Nonce Replay
          </button>
        </div>
      </div>

      {/* 3D Tunnel Canvas Viewport */}
      <div className="relative w-full h-[280px] sm:h-[340px] rounded-xl overflow-hidden bg-gradient-to-b from-surface-sunken/40 via-surface/60 to-surface-elevated/40 border border-hairline my-3">
        <div ref={containerRef} className="w-full h-full" />

        {/* Current Active Gate HUD */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 text-[11px] font-mono text-ink-primary bg-surface/90 px-3 py-1.5 rounded-xl border border-hairline-strong backdrop-blur-md shadow-sm">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span>Active Gate: {GATES[currentGateIndex]?.name}</span>
        </div>
      </div>

      {/* Gate Status Ribbon */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[10.5px] font-mono">
        {GATES.map((gate, i) => {
          const isPassed = currentGateIndex >= i;
          return (
            <div
              key={gate.id}
              className={`p-2 rounded-lg border transition-all ${
                isPassed
                  ? activeVerdict === "clean"
                    ? "bg-allow/10 border-allow/30 text-allow font-semibold"
                    : "bg-block/10 border-block/30 text-block font-semibold"
                  : "bg-surface-elevated border-hairline text-ink-muted"
              }`}
            >
              <div>L{gate.id}</div>
              <div className="text-[9.5px] text-ink-primary truncate mt-0.5">{gate.name.split(":")[1]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
