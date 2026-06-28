import React, { useRef, useEffect } from 'react';

export function InteractiveTopologyGrid({ lastPulse, systemStatus, onNodeClick }) {
  const canvasRef = useRef(null);
  
  // Track viewport scale and translation offsets
  const viewportRef = useRef({ scale: 1.0, panX: 0, panY: 0 });
  const mouseRef = useRef({ x: 0, y: 0, rx: 0, ry: 0, active: false, isDragging: false, startDragX: 0, startDragY: 0 });
  const pulseTriggerRef = useRef(null);

  // Trigger animations when lastPulse changes
  useEffect(() => {
    if (lastPulse) {
      pulseTriggerRef.current = {
        ...lastPulse,
        born: Date.now(),
        duration: 2000,
        phase: 'checkout'
      };
    }
  }, [lastPulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let nodes = {};
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = Math.max(canvas.parentElement.clientHeight, 360);

      const w = canvas.width;
      const h = canvas.height;

      // Establish nodes in world coordinates
      nodes = {
        requestor: { id: 'requestor', name: 'Requestor Agent', x: w * 0.15, y: h * 0.5, size: 20, color: '80, 180, 255', pulseGlow: 0 },
        hook: { id: 'hook', name: 'Antigravity Hook', x: w * 0.15, y: h * 0.5, size: 55, color: '0, 229, 255', pulseGlow: 0, isShield: true },
        gateway: { id: 'gateway', name: 'MCP Gateway', x: w * 0.5, y: h * 0.5, size: 24, color: '0, 229, 255', pulseGlow: 0 },
        governance: { id: 'governance', name: 'Governance Agent', x: w * 0.5, y: h * 0.22, size: 20, color: '189, 0, 255', pulseGlow: 0 },
        tool_read: { id: 'tool_read', name: 'read_file', x: w * 0.85, y: h * 0.32, size: 14, color: '0, 245, 160', pulseGlow: 0 },
        tool_write: { id: 'tool_write', name: 'write_to_file', x: w * 0.85, y: h * 0.5, size: 14, color: '0, 245, 160', pulseGlow: 0 },
        tool_search: { id: 'tool_search', name: 'search_web', x: w * 0.85, y: h * 0.68, size: 14, color: '0, 245, 160', pulseGlow: 0 }
      };
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse Move (converts screen coordinates to world coordinates under zoom/pan)
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const v = viewportRef.current;
      const m = mouseRef.current;

      // Project screen point back to world space
      m.x = (screenX - v.panX) / v.scale;
      m.y = (screenY - v.panY) / v.scale;
      m.active = true;

      // Handle viewport dragging (pan)
      if (m.isDragging) {
        v.panX = screenX - m.startDragX;
        v.panY = screenY - m.startDragY;
      }
    };

    const handleMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const v = viewportRef.current;
      const m = mouseRef.current;

      // Check if we clicked on any node (world coordinates check)
      let clickedNode = null;
      Object.keys(nodes).forEach((key) => {
        const node = nodes[key];
        if (node.isShield) return;
        const dx = m.x - node.x;
        const dy = m.y - node.y;
        if (Math.sqrt(dx * dx + dy * dy) < node.size * 1.5) {
          clickedNode = node.id;
        }
      });

      if (clickedNode) {
        if (onNodeClick) onNodeClick(clickedNode);
      } else {
        // Start dragging/panning empty space
        m.isDragging = true;
        m.startDragX = screenX - v.panX;
        m.startDragY = screenY - v.panY;
      }
    };

    const handleMouseUp = () => {
      mouseRef.current.isDragging = false;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.isDragging = false;
    };

    // Scroll wheel zoom enforcer
    const handleWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const v = viewportRef.current;
      const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;

      const prevScale = v.scale;
      v.scale = Math.min(Math.max(v.scale * zoomFactor, 0.5), 3.0); // clamp zoom 0.5x to 3.0x

      // Adjust panning so zoom is centered on the cursor
      v.panX = screenX - (screenX - v.panX) * (v.scale / prevScale);
      v.panY = screenY - (screenY - v.panY) * (v.scale / prevScale);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    let particles = [];
    const spawnParticles = (fromNode, toNode, colorStr, count = 10) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: fromNode.x,
          y: fromNode.y,
          startX: fromNode.x,
          startY: fromNode.y,
          endX: toNode.x,
          endY: toNode.y,
          progress: -(i * 0.08),
          speed: 0.02 + Math.random() * 0.015,
          color: colorStr,
          size: 2 + Math.random() * 1.5
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const now = Date.now();

      const m = mouseRef.current;
      m.rx += (m.x - m.rx) * 0.1;
      m.ry += (m.y - m.ry) * 0.1;

      // Apply Zoom & Pan Transformations
      ctx.save();
      const v = viewportRef.current;
      ctx.translate(v.panX, v.panY);
      ctx.scale(v.scale, v.scale);

      // 1. Draw Mouse-Reactive Grid Background (World Space coordinates)
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 24;
      
      const startX = -v.panX / v.scale;
      const startY = -v.panY / v.scale;
      const endX = (w - v.panX) / v.scale;
      const endY = (h - v.panY) / v.scale;

      const roundedStart = Math.floor(startX / gridSize) * gridSize;
      const roundedStartY = Math.floor(startY / gridSize) * gridSize;

      for (let x = roundedStart; x < endX; x += gridSize) {
        ctx.beginPath();
        for (let y = roundedStartY; y < endY; y += 10) {
          let px = x;
          let py = y;
          if (m.active) {
            const dx = m.rx - x;
            const dy = m.ry - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
              const force = (120 - dist) / 120;
              px -= dx * force * 0.2;
              py -= dy * force * 0.2;
            }
          }
          if (y === roundedStartY) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      for (let y = roundedStartY; y < endY; y += gridSize) {
        ctx.beginPath();
        for (let x = roundedStart; x < endX; x += 10) {
          let px = x;
          let py = y;
          if (m.active) {
            const dx = m.rx - x;
            const dy = m.ry - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
              const force = (120 - dist) / 120;
              px -= dx * force * 0.2;
              py -= dy * force * 0.2;
            }
          }
          if (x === roundedStart) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Handle active WebSocket pulses
      const pulse = pulseTriggerRef.current;
      if (pulse) {
        const elapsed = now - pulse.born;
        const progress = elapsed / pulse.duration;

        if (progress >= 1) {
          pulseTriggerRef.current = null;
        } else {
          if (pulse.phase === 'checkout') {
            if (elapsed < 600 && particles.length === 0) {
              spawnParticles(nodes.requestor, nodes.gateway, '0, 229, 255');
              nodes.requestor.pulseGlow = 10;
            }
            if (elapsed >= 600 && elapsed < 1200 && pulse.phase === 'checkout') {
              pulse.phase = 'governance';
              spawnParticles(nodes.gateway, nodes.governance, '189, 0, 255');
              nodes.gateway.pulseGlow = 10;
            }
          } else if (pulse.phase === 'governance' && elapsed >= 1200) {
            pulse.phase = 'execute';
            const isSuccess = pulse.status === 'SUCCESS' || pulse.status === 'AUTHORIZED';
            
            nodes.governance.pulseGlow = 15;

            if (pulse.status === 'CRITICAL_BYPASS') {
              spawnParticles(nodes.requestor, nodes.tool_read, '255, 59, 105', 15);
            } else if (isSuccess) {
              spawnParticles(nodes.governance, nodes.gateway, '0, 245, 160', 8);
              let targetTool = nodes.tool_read;
              if (pulse.toolName === 'write_to_file') targetTool = nodes.tool_write;
              if (pulse.toolName === 'search_web') targetTool = nodes.tool_search;
              
              setTimeout(() => {
                spawnParticles(nodes.gateway, targetTool, '0, 245, 160', 10);
                targetTool.pulseGlow = 10;
              }, 200);
            } else {
              spawnParticles(nodes.governance, nodes.gateway, '255, 59, 105', 12);
              nodes.gateway.pulseGlow = 15;
            }
          }
        }
      }

      // 2. Draw static connecting paths
      const drawPath = (from, to, color = 'rgba(255,255,255,0.035)', width = 1.2) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      };

      const isShutdown = systemStatus === 'EMERGENCY_SHUTDOWN';
      const defaultLineColor = isShutdown ? 'rgba(255, 59, 105, 0.08)' : 'rgba(255,255,255,0.04)';
      
      drawPath(nodes.requestor, nodes.gateway, defaultLineColor, 1.5);
      drawPath(nodes.gateway, nodes.governance, defaultLineColor, 1.2);
      drawPath(nodes.gateway, nodes.tool_read, defaultLineColor, 1.2);
      drawPath(nodes.gateway, nodes.tool_write, defaultLineColor, 1.2);
      drawPath(nodes.gateway, nodes.tool_search, defaultLineColor, 1.2);

      // 3. Draw particles flowing
      particles.forEach((p) => {
        p.progress += p.speed;
        if (p.progress >= 0 && p.progress <= 1) {
          const currentX = p.startX + (p.endX - p.startX) * p.progress;
          const currentY = p.startY + (p.endY - p.startY) * p.progress;

          ctx.beginPath();
          ctx.arc(currentX, currentY, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color}, 0.8)`;
          ctx.shadowBlur = 6;
          ctx.shadowColor = `rgb(${p.color})`;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
      particles = particles.filter(p => p.progress < 1);

      // 4. Draw Hook Shield (Antigravity Lockout bubble)
      const hNode = nodes.hook;
      ctx.beginPath();
      ctx.arc(hNode.x, hNode.y, hNode.size, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      
      if (isShutdown) {
        ctx.strokeStyle = 'rgba(255, 59, 105, 0.2)';
        ctx.fillStyle = 'rgba(255, 59, 105, 0.015)';
      } else {
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
        ctx.fillStyle = 'rgba(0, 229, 255, 0.005)';
      }
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.fill();
      ctx.setLineDash([]);

      ctx.font = '8px JetBrains Mono';
      ctx.fillStyle = isShutdown ? '#ff3b69' : '#00e5ff';
      ctx.fillText('[ANTIGRAVITY HOOK]', hNode.x - 45, hNode.y + hNode.size + 12);

      // 5. Draw Nodes
      Object.keys(nodes).forEach((key) => {
        const node = nodes[key];
        if (node.isShield) return;

        let targetSize = node.size;
        let isHovered = false;
        if (m.active) {
          const dx = m.x - node.x;
          const dy = m.y - node.y;
          if (Math.sqrt(dx * dx + dy * dy) < node.size * 1.2) {
            targetSize = node.size * 1.25;
            isHovered = true;
          }
        }

        if (node.pulseGlow > 0) {
          node.pulseGlow -= 0.25;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, targetSize + 3 + node.pulseGlow, 0, Math.PI * 2);
        
        let glowColor = `rgba(${node.color}, 0.1)`;
        if (isShutdown && node.id !== 'governance') {
          glowColor = 'rgba(255, 59, 105, 0.04)';
        }
        ctx.fillStyle = glowColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, targetSize, 0, Math.PI * 2);
        
        let coreColor = `rgb(${node.color})`;
        if (isShutdown && node.id !== 'governance') {
          coreColor = 'rgb(100, 30, 45)';
        }
        ctx.fillStyle = coreColor;
        ctx.shadowBlur = isHovered ? 15 : 8 + node.pulseGlow;
        ctx.shadowColor = coreColor;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#f8fafc';
        ctx.font = `600 ${node.id === 'gateway' ? '10px' : '9px'} Plus Jakarta Sans`;
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y - targetSize - 8);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '8px JetBrains Mono';
        let subText = '';
        if (node.id === 'gateway') subText = isShutdown ? 'LOCKED' : 'GW: 127.0.0.1:4000';
        else if (node.id === 'governance') subText = 'POLICY';
        else if (node.id === 'requestor') subText = isShutdown ? 'BLOCKED' : 'ONLINE';
        else if (node.id.startsWith('tool_')) subText = 'TOOL';
        
        ctx.fillText(subText, node.x, node.y + targetSize + 12);
      });

      // Restore viewport context
      ctx.restore();

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [systemStatus, onNodeClick]);

  return (
    <div className="relative w-full h-full flex flex-col items-stretch" style={{ minHeight: '340px' }}>
      {/* Topology legends */}
      <div className="absolute top-3 left-3 z-10 font-mono-custom text-[8px] flex gap-3 text-slate-400">
        <span className="flex items-center gap-1">
          <span className="status-dot green"></span> Approved
        </span>
        <span className="flex items-center gap-1">
          <span className="status-dot cyan"></span> Gateway
        </span>
        <span className="flex items-center gap-1">
          <span className="status-dot purple"></span> Policy Engine
        </span>
        <span className="flex items-center gap-1">
          <span className="status-dot red"></span> Threat Block
        </span>
      </div>

      <div className="flex-1 w-full relative">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>
    </div>
  );
}
export default InteractiveTopologyGrid;
