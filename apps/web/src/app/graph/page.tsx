'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface GraphNode {
  id: string;
  name: string;
  _label: string;
  color_palette?: string[];
  energy?: number;
  description?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

// Monochrome — no label colors on canvas

interface SpaceNode {
  id: string;
  name: string;
  label: string;
  connections: number;
  // 3D world position (fixed in space)
  wx: number;
  wy: number;
  wz: number;
  // Real-world "importance radius" — all nodes are same base size,
  // but more connected nodes are slightly larger (like a bigger star)
  worldRadius: number;
  // Screen projected
  sx: number;
  sy: number;
  depth: number; // distance from camera (for sorting + sizing)
  screenRadius: number;
  screenAlpha: number;
  tier: number;
  description?: string;
  color_palette?: string[];
}

export default function GraftPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [spaceNodes, setSpaceNodes] = useState<SpaceNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<SpaceNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SpaceNode | null>(null);
  const [search, setSearch] = useState('');
  const [referenceNode, setReferenceNode] = useState<SpaceNode | null>(null);
  const [refSearch, setRefSearch] = useState('');

  // Camera: position in 3D space + rotation
  const cameraRef = useRef({
    // Camera distance from center (zoom = moving closer/farther)
    distance: 800,
    targetDistance: 800,
    // Rotation angles
    rx: 0, ry: 0,
    // Auto-rotate velocity (very slow)
    autoVx: 0.00008,
    autoVy: 0.00003,
    // Focus rotation targets
    focusRx: null as number | null,
    focusRy: null as number | null,
  });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, moved: false });
  const animRef = useRef<number>(0);
  const sizeRef = useRef({ w: 1920, h: 1080 });
  const projectedRef = useRef<SpaceNode[]>([]);

  useEffect(() => {
    fetch(`${API}/api/graph/visualization`)
      .then(r => r.json())
      .then(data => {
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      })
      .catch(console.error);
  }, []);

  // Place nodes in 3D space
  useEffect(() => {
    if (nodes.length === 0) return;

    const connCount = new Map<string, number>();
    for (const e of edges) {
      connCount.set(e.source, (connCount.get(e.source) || 0) + 1);
      connCount.set(e.target, (connCount.get(e.target) || 0) + 1);
    }

    // Sort by connections for tier assignment
    const sorted = [...nodes].map(n => ({
      ...n,
      connections: connCount.get(n.id) || 0,
    })).sort((a, b) => b.connections - a.connections);

    const total = sorted.length;
    const tierMap = new Map<string, number>();
    sorted.forEach((n, i) => {
      if (i < total * 0.05) tierMap.set(n.id, 0);
      else if (i < total * 0.15) tierMap.set(n.id, 1);
      else if (i < total * 0.45) tierMap.set(n.id, 2);
      else tierMap.set(n.id, 3);
    });

    // Distribute on a sphere in 3D space
    // Sphere radius = 400 world units
    const SPHERE_R = 400;
    const golden = Math.PI * (3 - Math.sqrt(5));

    const mapped: SpaceNode[] = nodes.map((n, i) => {
      const y = 1 - (i / Math.max(nodes.length - 1, 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const angle = golden * i;

      const conn = connCount.get(n.id) || 0;
      // World radius: base 3, slightly bigger for more connected nodes
      const worldRadius = 3 + Math.min(conn * 0.5, 5);

      return {
        id: n.id,
        name: n.name,
        label: n._label,
        connections: conn,
        wx: SPHERE_R * radiusAtY * Math.cos(angle),
        wy: SPHERE_R * y,
        wz: SPHERE_R * radiusAtY * Math.sin(angle),
        worldRadius,
        sx: 0, sy: 0, depth: 0, screenRadius: 0, screenAlpha: 0,
        tier: tierMap.get(n.id) ?? 3,
        description: n.description,
        color_palette: n.color_palette,
      };
    });

    setSpaceNodes(mapped);
  }, [nodes, edges]);

  // Perspective projection: world coords → screen coords
  const projectAll = useCallback((sn: SpaceNode[], rx: number, ry: number, camDist: number) => {
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;
    const cx = W / 2;
    const cy = H / 2;
    // Perspective focal length
    const fov = 600;

    const cosRy = Math.cos(ry), sinRy = Math.sin(ry);
    const cosRx = Math.cos(rx), sinRx = Math.sin(rx);

    return sn.map(n => {
      // Rotate world position around Y axis
      let x = n.wx * cosRy - n.wz * sinRy;
      let z = n.wx * sinRy + n.wz * cosRy;
      let y = n.wy;

      // Rotate around X axis
      const y2 = y * cosRx - z * sinRx;
      const z2 = y * sinRx + z * cosRx;
      y = y2; z = z2;

      // Camera is at (0, 0, -camDist), looking at origin
      // Translate so camera is at origin looking down +Z
      z = z + camDist;

      // Perspective divide
      const scale = z > 10 ? fov / z : fov / 10;
      const sx = cx + x * scale;
      const sy = cy - y * scale; // flip Y for screen

      // Screen radius = world radius * perspective scale
      const screenRadius = n.worldRadius * scale;

      // Alpha based on distance — closer = brighter, farther = dimmer
      // Like stars: inverse square-ish falloff but clamped
      const maxDist = 1200;
      const normDist = Math.min(z / maxDist, 1);
      const screenAlpha = z < 10 ? 0 : Math.max(0.03, 1 - normDist * normDist);

      return {
        ...n,
        sx, sy,
        depth: z,
        screenRadius: Math.max(0.5, screenRadius),
        screenAlpha,
      };
    });
  }, []);

  // Render loop
  useEffect(() => {
    if (spaceNodes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth * 2;
      canvas.height = window.innerHeight * 2;
      sizeRef.current = { w: canvas.width, h: canvas.height };
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext('2d')!;
    const edgePairs = edges.map(e => [e.source, e.target] as [string, string]);

    const draw = () => {
      const cam = cameraRef.current;

      // Smooth zoom (distance interpolation)
      cam.distance += (cam.targetDistance - cam.distance) * 0.08;

      // Smooth rotation toward focus
      if (cam.focusRy !== null) {
        // Normalize angle difference
        let dRy = cam.focusRy - cam.ry;
        while (dRy > Math.PI) dRy -= 2 * Math.PI;
        while (dRy < -Math.PI) dRy += 2 * Math.PI;
        cam.ry += dRy * 0.06;
        if (Math.abs(dRy) < 0.002) cam.focusRy = null;
      }
      if (cam.focusRx !== null) {
        let dRx = cam.focusRx - cam.rx;
        cam.rx += dRx * 0.06;
        if (Math.abs(dRx) < 0.002) cam.focusRx = null;
      }

      // Very slow auto-rotate when not focused
      if (!dragRef.current.dragging && cam.focusRy === null) {
        cam.ry += cam.autoVx;
        cam.rx += cam.autoVy;
      }

      const projected = projectAll(spaceNodes, cam.rx, cam.ry, cam.distance);
      const nodeMap = new Map(projected.map(n => [n.id, n]));
      projectedRef.current = projected;

      const W = sizeRef.current.w;
      const H = sizeRef.current.h;

      // Pure black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // Draw edges — same "real" thickness, perspective makes them thinner at distance
      for (const [srcId, tgtId] of edgePairs) {
        const s = nodeMap.get(srcId);
        const t = nodeMap.get(tgtId);
        if (!s || !t) continue;

        // Skip if both behind camera
        if (s.depth < 10 && t.depth < 10) continue;

        // Skip if both off-screen and far
        const margin = 200;
        if (s.sx < -margin && t.sx < -margin) continue;
        if (s.sx > W + margin && t.sx > W + margin) continue;
        if (s.sy < -margin && t.sy < -margin) continue;
        if (s.sy > W + margin && t.sy > W + margin) continue;

        const isSelectedEdge = selectedNode && (srcId === selectedNode.id || tgtId === selectedNode.id);
        const isHoveredEdge = hoveredNode && (srcId === hoveredNode.id || tgtId === hoveredNode.id);
        const isRefEdge = referenceNode && (srcId === referenceNode.id || tgtId === referenceNode.id);

        // Line width scales with perspective — same real-world thickness
        // Bold on outside (close to camera), thinner toward center/back
        const avgScreenRadius = (s.screenRadius + t.screenRadius) / 2;
        let lineWidth = avgScreenRadius * 0.4; // bold base — scales with perspective

        // Alpha from perspective (closer = brighter)
        const avgAlpha = (s.screenAlpha + t.screenAlpha) / 2;
        let alpha = avgAlpha;

        // Center fade — lines passing through the middle of the sphere dissolve
        const midX = (s.sx + t.sx) / 2;
        const midY = (s.sy + t.sy) / 2;
        const distFromCenter = Math.sqrt((midX - W / 2) ** 2 + (midY - H / 2) ** 2);
        const maxDist = Math.min(W, H) * 0.38;
        const centerFade = Math.min(1, Math.pow(distFromCenter / maxDist, 1.5));

        // Is this a 2nd-degree connection? (connected to a node that's connected to selected)
        const isSecondDegree = selectedNode && !isSelectedEdge && edgePairs.some(([es, et]) => {
          const otherEnd = es === srcId ? et : (et === srcId ? es : (es === tgtId ? et : (et === tgtId ? es : null)));
          if (!otherEnd) return false;
          return edgePairs.some(([s2, t2]) => (s2 === selectedNode!.id && t2 === otherEnd) || (t2 === selectedNode!.id && s2 === otherEnd));
        });

        if (isRefEdge || isSelectedEdge) {
          // Selected/reference edges: bold, ignore center fade
          alpha = Math.min(0.9, avgAlpha * 3);
          lineWidth = Math.max(lineWidth, 3);
        } else if (isHoveredEdge) {
          alpha = Math.min(0.7, avgAlpha * 2.5);
          lineWidth = Math.max(lineWidth, 2);
        } else if (isSecondDegree) {
          // 2nd degree: faintly visible
          alpha = avgAlpha * 0.15 * centerFade;
          lineWidth = Math.max(lineWidth * 0.5, 0.5);
        } else if (selectedNode || hoveredNode || referenceNode) {
          // Everything else dims hard when something is selected
          alpha *= 0.02 * centerFade;
        } else {
          // Default: bold on edges, fading toward center
          alpha *= 0.6 * centerFade;
        }

        // Clamp
        lineWidth = Math.max(0.3, Math.min(lineWidth, 8));
        alpha = Math.max(0, Math.min(1, alpha));

        if (alpha < 0.004) continue;

        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy);
        ctx.lineTo(t.sx, t.sy);
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }

      // Sort back-to-front for proper overlap
      projected.sort((a, b) => b.depth - a.depth);

      // Draw nodes
      for (const n of projected) {
        if (n.depth < 10) continue; // behind camera

        const isHovered = hoveredNode?.id === n.id;
        const isSelected = selectedNode?.id === n.id;
        const isReference = referenceNode?.id === n.id;
        const isConnectedToSelected = selectedNode && edgePairs.some(
          ([s, t]) => (s === selectedNode.id && t === n.id) || (t === selectedNode.id && s === n.id)
        );
        const isConnectedToRef = referenceNode && !isReference && edgePairs.some(
          ([s, t]) => (s === referenceNode.id && t === n.id) || (t === referenceNode.id && s === n.id)
        );

        // 2nd degree: connected to something that's connected to selected
        const isSecondDegree = selectedNode && !isSelected && !isConnectedToSelected && edgePairs.some(([s, t]) => {
          const neighbor = s === n.id ? t : (t === n.id ? s : null);
          if (!neighbor) return false;
          return edgePairs.some(([s2, t2]) => (s2 === selectedNode!.id && t2 === neighbor) || (t2 === selectedNode!.id && s2 === neighbor));
        });

        let alpha = n.screenAlpha;
        let radius = n.screenRadius;

        if (isReference) {
          alpha = 1;
          radius *= 2;
        } else if (isSelected || isHovered) {
          alpha = 1;
          radius *= 1.8;
        } else if (isConnectedToSelected || isConnectedToRef) {
          alpha = Math.min(1, alpha * 2);
          radius *= 1.4;
        } else if (isSecondDegree) {
          // Faintly visible — the extended network
          alpha = Math.min(0.35, alpha * 0.6);
          radius *= 1.1;
        } else if (selectedNode || referenceNode) {
          alpha *= (referenceNode ? 0.04 : 0.06);
        }

        // Skip nearly invisible nodes for performance
        if (alpha < 0.02 && !isSelected && !isHovered) continue;
        // Skip off-screen
        if (n.sx < -50 || n.sx > W + 50 || n.sy < -50 || n.sy > H + 50) continue;

        // Node dot
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, alpha))})`;
        ctx.fill();

        // Glow
        if (isReference) {
          // Reference node gets a colored glow
          const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, radius * 6);
          glow.addColorStop(0, 'rgba(255,255,255,0.2)');
          glow.addColorStop(0.5, 'rgba(255,255,255,0.06)');
          glow.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, radius * 6, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        } else if (isSelected || isHovered) {
          const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, radius * 5);
          glow.addColorStop(0, 'rgba(255,255,255,0.1)');
          glow.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, radius * 5, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Labels — show when close enough, or when connected to selected node
        const showLabel = isSelected || isHovered || isConnectedToSelected || isConnectedToRef ||
          (isSecondDegree && radius > 4) ||
          (radius > 6 && alpha > 0.3);

        if (showLabel) {
          // Font size proportional to screen radius (perspective-correct)
          const fontSize = isSelected || isHovered ? Math.max(20, radius * 2.5) :
            isConnectedToSelected ? Math.max(14, radius * 2) :
            Math.max(10, radius * 1.8);

          const labelAlpha = isSelected || isHovered ? 1 :
            isConnectedToSelected ? Math.min(1, alpha * 1.5) :
            Math.min(0.8, alpha * 0.7);

          ctx.font = `${isSelected || isHovered || n.tier === 0 ? '700' : '400'} ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(255,255,255,${labelAlpha})`;
          ctx.textAlign = 'center';
          ctx.fillText(n.name, n.sx, n.sy + radius + fontSize * 0.8 + 4);

          // Type label for close-up nodes
          if ((isSelected || isHovered) || (radius > 12 && alpha > 0.5)) {
            ctx.font = `500 ${fontSize * 0.45}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = `rgba(255,255,255,${labelAlpha * 0.35})`;
            ctx.fillText(n.label.toUpperCase(), n.sx, n.sy + radius + fontSize * 0.8 + 4 + fontSize * 0.55);
          }
        }
      }

      // Stats
      ctx.font = '18px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.textAlign = 'left';
      ctx.fillText(`${nodes.length} entities · ${edges.length} connections`, 48, H - 48);

      // Zoom indicator
      const zoomLevel = (800 / cam.distance).toFixed(1);
      if (Math.abs(cam.distance - 800) > 20) {
        ctx.textAlign = 'right';
        ctx.fillText(`${zoomLevel}×`, W - 48, H - 48);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [spaceNodes, edges, hoveredNode, selectedNode, referenceNode, projectAll, nodes.length]);

  // Scroll wheel → move camera closer/farther
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      // Move camera closer or farther
      const speed = cam.targetDistance * 0.08;
      cam.targetDistance += e.deltaY > 0 ? speed : -speed;
      // Clamp: can get very close (50) or very far (2000)
      cam.targetDistance = Math.max(50, Math.min(2000, cam.targetDistance));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Pinch zoom (trackpad gesture)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventGesture = (e: Event) => e.preventDefault();
    const handleGesture = (e: Event) => {
      e.preventDefault();
      const ge = e as any;
      if (ge.scale !== undefined) {
        const cam = cameraRef.current;
        cam.targetDistance = Math.max(50, Math.min(2000, cam.targetDistance / ge.scale));
      }
    };

    canvas.addEventListener('gesturestart', preventGesture, { passive: false });
    canvas.addEventListener('gesturechange', handleGesture as EventListener, { passive: false });
    return () => {
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', handleGesture as EventListener);
    };
  }, []);

  // Mouse: drag to rotate (slowly), click to focus
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const drag = dragRef.current;
    if (drag.dragging) {
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;

      // Very slow rotation — 0.002 radians per pixel
      cameraRef.current.ry += dx * 0.002;
      cameraRef.current.rx += dy * 0.002;
      // Clamp rx to avoid flipping
      cameraRef.current.rx = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraRef.current.rx));

      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }

    // Hit test — only front-facing, reasonably sized nodes
    const projected = projectedRef.current;
    let found: SpaceNode | null = null;
    let bestDist = Infinity;
    for (const n of projected) {
      if (n.depth < 20) continue;
      if (n.screenRadius < 1) continue;
      const dx = mx - n.sx;
      const dy = my - n.sy;
      const dist = dx * dx + dy * dy;
      const hitR = Math.max(n.screenRadius + 10, 18);
      if (dist < hitR * hitR && dist < bestDist) {
        found = n;
        bestDist = dist;
      }
    }
    setHoveredNode(found);
  }, [spaceNodes]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY, moved: false };
  };

  const handleMouseUp = () => {
    dragRef.current.dragging = false;
  };

  const handleClick = () => {
    if (dragRef.current.moved) return;

    if (hoveredNode) {
      setSelectedNode(hoveredNode);
      const cam = cameraRef.current;

      // Fly toward clicked node — rotate sphere so this node faces camera dead center
      const SPHERE_R = 400;
      const nodeAngleY = Math.atan2(hoveredNode.wz, hoveredNode.wx);
      const nodeAngleX = -Math.asin(Math.max(-1, Math.min(1, hoveredNode.wy / SPHERE_R)));

      cam.focusRy = -nodeAngleY;
      cam.focusRx = nodeAngleX;

      // Zoom to a sweet spot where the selected node is centered and
      // its connections fan out around it — close enough to read labels
      // but far enough to see the neighborhood
      cam.targetDistance = 350;
    } else {
      setSelectedNode(null);
    }
  };

  const handleDoubleClick = () => {
    const cam = cameraRef.current;
    cam.targetDistance = 800;
    cam.focusRx = null;
    cam.focusRy = null;
    setSelectedNode(null);
  };

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const cam = cameraRef.current;
      if (e.key === '=' || e.key === '+') {
        cam.targetDistance = Math.max(50, cam.targetDistance * 0.7);
      } else if (e.key === '-' || e.key === '_') {
        cam.targetDistance = Math.min(2000, cam.targetDistance * 1.4);
      } else if (e.key === '0') {
        cam.targetDistance = 800;
        cam.focusRx = null;
        cam.focusRy = null;
      } else if (e.key === 'Escape') {
        setSelectedNode(null);
        cam.targetDistance = 800;
        cam.focusRx = null;
        cam.focusRy = null;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const filteredNodes = search
    ? spaceNodes.filter(n => n.name.toLowerCase().includes(search.toLowerCase())).slice(0, 12)
    : [];

  return (
    <main style={{ height: 'calc(100vh - 70px)', position: 'relative', overflow: 'hidden', background: '#000' }}>
      {/* Reference Point Input — centered top */}
      <div style={{
        position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, width: '440px', maxWidth: 'calc(100vw - 48px)',
      }}>
        {referenceNode ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#fff',
              }} />
              <span style={{
                fontFamily: 'var(--font-display, Inter)', fontWeight: 700,
                fontSize: '0.85rem', letterSpacing: '0.02em',
              }}>{referenceNode.name}</span>
              <span style={{
                fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                opacity: 0.3,
              }}>{referenceNode.label}</span>
            </div>
            <button
              onClick={() => {
                setReferenceNode(null);
                setSelectedNode(null);
                const cam = cameraRef.current;
                cam.targetDistance = 800;
                cam.focusRx = null;
                cam.focusRy = null;
              }}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer', fontSize: '1rem', padding: '0 4px',
              }}
            >×</button>
          </div>
        ) : (
          <>
            <input
              placeholder="Enter a reference point — artist, brand, scene..."
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              style={{
                width: '100%', padding: '16px 20px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0', color: '#fff', fontSize: '0.85rem',
                fontFamily: 'Inter, system-ui, sans-serif', outline: 'none',
                textAlign: 'center',
              }}
              onFocus={(e) => e.target.style.textAlign = 'left'}
              onBlur={(e) => { if (!e.target.value) e.target.style.textAlign = 'center'; }}
            />
            {refSearch.length > 0 && (
              <div style={{
                background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none',
                maxHeight: '300px', overflow: 'auto',
              }}>
                {spaceNodes
                  .filter(n => n.name.toLowerCase().includes(refSearch.toLowerCase()))
                  .slice(0, 10)
                  .map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setReferenceNode(n);
                        setSelectedNode(n);
                        setRefSearch('');
                        // Fly to the reference node
                        const cam = cameraRef.current;
                        const SPHERE_R = 400;
                        cam.focusRy = -Math.atan2(n.wz, n.wx);
                        cam.focusRx = -Math.asin(n.wy / SPHERE_R);
                        cam.targetDistance = 200;
                      }}
                      style={{
                        padding: '14px 20px', cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)',
                        display: 'flex', alignItems: 'center', gap: '10px',
                      }}
                    >
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: '#fff',
                      }} />
                      {n.name}
                      <span style={{ opacity: 0.3, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: 'auto' }}>{n.label}</span>
                    </div>
                  ))}
                {spaceNodes.filter(n => n.name.toLowerCase().includes(refSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: '14px 20px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                    No matches — try another name
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Panel */}
      {selectedNode && (
        <div style={{
          position: 'absolute', top: '24px', right: '24px', zIndex: 10,
          width: '320px', background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.08)',
          padding: '28px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{
                fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.15em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
                marginBottom: '8px',
              }}>
                {selectedNode.label}
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{selectedNode.name}</h3>
              <div style={{ fontSize: '0.65rem', opacity: 0.3, marginTop: '4px' }}>
                {selectedNode.connections} connection{selectedNode.connections !== 1 ? 's' : ''}
              </div>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ opacity: 0.3, fontSize: '1.2rem', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
            >×</button>
          </div>
          {selectedNode.description && (
            <p style={{ marginTop: '16px', fontSize: '0.8rem', lineHeight: 1.7, opacity: 0.5 }}>
              {selectedNode.description}
            </p>
          )}
{/* monochrome — no color palette */}
        </div>
      )}

      {/* GRAFT watermark */}
      <div style={{
        position: 'absolute', top: '24px', right: selectedNode ? '368px' : '24px',
        zIndex: 5, transition: 'right 0.3s',
      }}>
        <span style={{
          fontFamily: 'var(--font-display, Inter)',
          fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.3em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.1)',
        }}>
          GRAFT
        </span>
      </div>

      {/* Controls hint */}
      <div style={{
        position: 'absolute', bottom: '24px', right: '24px', zIndex: 5,
        fontSize: '0.55rem', color: 'rgba(255,255,255,0.06)',
        textAlign: 'right', lineHeight: 1.8,
      }}>
        scroll to fly · drag to look · click to focus<br />
        double-click to reset · +/− keys
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{
          width: '100%', height: '100%',
          cursor: hoveredNode ? 'pointer' : dragRef.current.dragging ? 'grabbing' : 'grab',
        }}
      />
    </main>
  );
}
