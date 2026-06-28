import React, { useState, useEffect, useRef, useCallback } from 'react';
import useWebSocket from './hooks/useWebSocket';
import InteractiveTopologyGrid from './components/InteractiveTopologyGrid';
import KineticAlerts from './components/KineticAlerts';
import ToastSystem from './components/ToastSystem';

// Ticking TTL Timer helper
const EphemeralTimer = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(remaining);
    };

    updateTime();
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (timeLeft <= 0) {
    return <span className="text-slate-500 font-bold uppercase text-[9px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Expired</span>;
  }

  const secs = (timeLeft / 1000).toFixed(1);
  return (
    <span className="text-cyan-400 text-[10px] font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {secs}s
    </span>
  );
};

// Dynamic backend address resolver (supports local fallback and dynamic tunnels/hosting)
const wsUrl = window.location.hostname === 'localhost'
  ? 'ws://127.0.0.1:4000'
  : `wss://${window.location.hostname}`;

const httpUrl = window.location.hostname === 'localhost'
  ? 'http://127.0.0.1:4000'
  : `https://${window.location.hostname}`;

const BLOCKED_LOG_TYPES = [
  'SHELL_INJECTION',
  'GATEWAY_BYPASS_ATTEMPT',
  'DESTRUCTIVE_COMMAND',
  'SYSTEM_FILE_ACCESS',
  'SQL_INJECTION',
  'SYSTEM_MODIFICATION'
];

// Inline StatCard component
const StatCard = ({ label, value, color }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: '#090d16',
    border: `1px solid ${color}`,
    borderRadius: '8px',
    boxShadow: `0 0 10px ${color}1a`
  }}>
    <div style={{
      fontSize: '24px',
      fontWeight: '900',
      color: color,
      fontFamily: "'Orbitron', sans-serif"
    }}>
      {value}
    </div>
    <div style={{
      fontSize: '10px',
      color: '#8a99ad',
      textTransform: 'uppercase',
      marginTop: '4px',
      fontFamily: "'Orbitron', sans-serif",
      textAlign: 'center',
      letterSpacing: '1px'
    }}>
      {label}
    </div>
  </div>
);

export function App() {
  // Live Counters
  const [activeAgents, setActiveAgents] = useState(0);
  const [blockedAnomalies, setBlockedAnomalies] = useState(0);
  const [credentialsRevoked, setCredentialsRevoked] = useState(0);
  const [systemHealth, setSystemHealth] = useState(85);

  const [simulating, setSimulating] = useState(null);
  const [logConsole, setLogConsole] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [cooldown, setCooldown] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Real-Time States & Refs
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [registryEntries, setRegistryEntries] = useState([]);
  const lastSimulationTimeRef = useRef(0);
  const SIMULATION_COOLDOWN = 5000;
  const lastSeenAnomalyIdRef = useRef(null);
  
  const cooldownTimerRef = useRef(null);

  // Dynamic health color
  const healthColor = systemHealth > 70
    ? '#00f5a0'
    : systemHealth > 40
    ? '#ffaa00'
    : '#ff0055';

  // Deduplicating Logger
  const addLog = (msg) => {
    const timeStr = new Date().toLocaleTimeString();
    setLogConsole(prev => {
      if (prev.length > 0 && prev[0].rawText === msg) {
        const updated = [...prev];
        updated[0] = {
          ...updated[0],
          time: timeStr,
          count: updated[0].count + 1
        };
        return updated;
      }
      return [{ rawText: msg, time: timeStr, count: 1 }, ...prev].slice(0, 10);
    });
  };

  // Add entry to Ledger
  const addToLedger = useCallback((entry) => {
    const newEntry = {
      ...entry,
      timestamp: Date.now(),
      timeDisplay: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit', 
        second: '2-digit',
        hour12: true
      })
    };
    setLedgerEntries(prev => [newEntry, ...prev].slice(0, 50));
  }, []);

  // WebSocket message callback
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'initial_sync') {
      setActiveAgents(msg.data?.activeGrants?.length || 0);
      setBlockedAnomalies(msg.data?.anomalies?.length || 0);
      let score = 100;
      (msg.data?.anomalies || []).forEach(a => {
        if (a.type !== 'DESTRUCTIVE_COMMAND') {
          if (a.severity === 'critical') score -= 15;
          else if (a.severity === 'medium') score -= 5;
        }
      });
      setSystemHealth(msg.data?.status === 'EMERGENCY_SHUTDOWN' ? 0 : Math.max(0, score));

      // Initial ledger sync
      const initialLogs = (msg.data?.anomalies || []).map(a => ({
        agentId: a.agentId || 'SYSTEM',
        action: a.type || 'ANOMALY_BLOCKED',
        severity: a.severity === 'critical' ? 'CRITICAL' : a.severity === 'medium' ? 'WARNING' : 'INFO',
        timestamp: a.timestamp || Date.now(),
        timeDisplay: new Date(a.timestamp || Date.now()).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      }));
      setLedgerEntries(initialLogs);

      // Initial registry sync
      const initialGrants = (msg.data?.activeGrants || []).map(g => ({
        token: g.token,
        tokenRef: g.token ? (g.token.slice(0, 8) + '...') : 'N/A',
        agentId: g.agentId,
        toolTarget: g.toolName,
        expiresAt: g.expiresAt,
        ttl: g.expiresAt
          ? Math.max(0, Math.round((g.expiresAt - Date.now()) / 1000)) + 's'
          : 'N/A',
        status: g.status || 'AUTHORIZED'
      }));
      setRegistryEntries(initialGrants);
    }
    if (msg.type === 'registry_update') {
      setActiveAgents(msg.data?.length || 0);

      addToLedger({
        agentId: 'SYSTEM',
        action: 'REGISTRY_UPDATED',
        severity: 'INFO',
        timestamp: new Date().toLocaleTimeString()
      });

      const mapped = (msg.data || []).map(g => ({
        token: g.token,
        tokenRef: g.token ? (g.token.slice(0, 8) + '...') : 'N/A',
        agentId: g.agentId,
        toolTarget: g.toolName,
        expiresAt: g.expiresAt,
        ttl: g.expiresAt
          ? Math.max(0, Math.round((g.expiresAt - Date.now()) / 1000)) + 's'
          : 'N/A',
        status: g.status || 'AUTHORIZED'
      }));
      setRegistryEntries(mapped);
    }
    if (msg.type === 'threat_alert') {
      setBlockedAnomalies(prev => prev + 1);
      setSystemHealth(prev => Math.max(prev - 2, 0));

      addToLedger({
        agentId: msg.data?.agentId || 'SYSTEM',
        action: msg.data?.type || 'THREAT_DETECTED',
        severity: 'CRITICAL',
        timestamp: new Date().toLocaleTimeString()
      });
    }
    if (msg.type === 'request_pulse' && msg.data?.status === 'EXPIRED_TTL') {
      setCredentialsRevoked(prev => prev + 1);

      addToLedger({
        agentId: msg.data.agentId,
        action: 'TOKEN_EXPIRED',
        severity: 'WARNING',
        timestamp: new Date().toLocaleTimeString()
      });

      setRegistryEntries(prev =>
        prev.filter(e => !e.tokenRef.startsWith(
          msg.data.token?.slice(0, 8)
        ))
      );
    }
    if (msg.type === 'system_status' && msg.data === 'EMERGENCY_SHUTDOWN') {
      setCredentialsRevoked(prev => prev + 1);
      setSystemHealth(0);

      addToLedger({
        agentId: 'SYSTEM',
        action: 'EMERGENCY_SHUTDOWN',
        severity: 'CRITICAL',
        timestamp: new Date().toLocaleTimeString()
      });
    }
    if (msg.type === 'request_pulse' && msg.data?.status === 'AUTHORIZED') {
      setSystemHealth(prev => Math.min(prev + 1, 100));

      addToLedger({
        agentId: msg.data.agentId,
        action: msg.data.toolName,
        severity: 'INFO',
        timestamp: new Date().toLocaleTimeString()
      });
    }
    if (msg.type === 'request_pulse' && msg.data?.approved === true) {
      setRegistryEntries(prev => {
        const exists = prev.find(e => e.token === msg.data.token);
        if (exists) return prev;
        return [...prev, {
          token: msg.data.token,
          tokenRef: msg.data.token?.slice(0, 8) + '...',
          agentId: msg.data.agentId,
          toolTarget: msg.data.toolName,
          expiresAt: msg.data.expiresAt,
          ttl: msg.data.expiresAt
            ? Math.max(0, Math.round((msg.data.expiresAt - Date.now()) / 1000)) + 's'
            : 'N/A',
          status: msg.data.status
        }];
      });
    }
    if (msg.type === 'system_reset') {
      setActiveAgents(0);
      setBlockedAnomalies(0);
      setCredentialsRevoked(0);
      setSystemHealth(85);
      setLedgerEntries([]);
      setRegistryEntries([]);
    }
  }, [addToLedger]);

  const {
    isConnected,
    systemStatus,
    activeGrants,
    anomalies,
    lastPulse,
    triggerKillSwitch,
    resetSystem
  } = useWebSocket(wsUrl, handleWsMessage);

  useEffect(() => {
    if (cooldown > 0) {
      cooldownTimerRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(cooldownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(cooldownTimerRef.current);
  }, [cooldown]);

  const addToast = (title, message, severity = 'info') => {
    const newToast = {
      id: `toast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title,
      message,
      severity,
      timestamp: Date.now()
    };
    setToasts(prev => [...prev, newToast]);
  };

  const handleDismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    if (lastPulse) {
      if (lastPulse.status === 'AUTHORIZED') {
        addToast('Passport Approved', `Token checked out for tool "${lastPulse.toolName}"`, 'safe');
      } else if (lastPulse.status === 'EXPIRED_TTL' || lastPulse.status === 'CRITICAL_BYPASS' || lastPulse.status.includes('REJECTION')) {
        if (lastPulse.status === 'EXPIRED_TTL') {
          addToast('Token Expired', `Credential for "${lastPulse.toolName}" hit TTL boundary`, 'medium');
        }
      }
    }
  }, [lastPulse]);

  useEffect(() => {
    if (anomalies.length > 0) {
      const latest = anomalies[0];
      const anomalyId = latest.id || latest.timestamp;
      
      if (anomalyId !== lastSeenAnomalyIdRef.current) {
        lastSeenAnomalyIdRef.current = anomalyId;
        
        const severity = latest.severity || 'medium';
        const isBlocked = BLOCKED_LOG_TYPES.includes(latest.type);
        
        if (!isBlocked && latest.type !== 'EMERGENCY_SHUTDOWN') {
          addToast(latest.type, latest.description, severity);
        }
      }
    }
  }, [anomalies]);

  const runSimulator = async (scenario) => {
    if (systemStatus === 'EMERGENCY_SHUTDOWN') {
      addLog('SIMULATION BLOCKED: System is locked down under Kill Switch.');
      return;
    }

    const now = Date.now();
    if (now - lastSimulationTimeRef.current < SIMULATION_COOLDOWN) {
      addLog('COOLDOWN ENFORCED: Wait before initiating another simulation.');
      return;
    }
    lastSimulationTimeRef.current = now;

    setSimulating(scenario);
    addLog(`Initiating scenario: "${scenario.toUpperCase()}"...`);
    setCooldown(5);

    const agentId = 'requestor-agent-01';

    try {
      if (scenario === 'authorized') {
        addLog('1. Requesting checkout for "read_file"...');
        const checkRes = await fetch(`${httpUrl}/mcp/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, toolName: 'read_file', args: { AbsolutePath: 'c:/Users/bandi/OneDrive/capstone/data.json' } })
        });
        const checkout = await checkRes.json();
        
        if (checkout.error) {
          addLog(`Checkout Denied: ${checkout.error}`);
          setSimulating(null);
          return;
        }

        addLog(`2. Token issued: ${checkout.token.substring(0,12)}... Executing tool call...`);
        const execRes = await fetch(`${httpUrl}/mcp/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, toolName: 'read_file', token: checkout.token, args: { AbsolutePath: 'c:/Users/bandi/OneDrive/capstone/data.json' } })
        });
        const result = await execRes.json();
        addLog(`Success: ${result.result}`);

      } else if (scenario === 'bypass') {
        addLog('WARNING: Simulating direct tool bypass...');
        addLog('Action: Agent attempts raw access of tool "read_file" bypassing Gateway.');
        
        await fetch(`${httpUrl}/api/report-bypass`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'anomaly_detected',
            data: {
              agentId,
              type: 'GATEWAY_BYPASS_ATTEMPT',
              tool: 'read_file',
              payload: { AbsolutePath: 'c:/Users/bandi/OneDrive/capstone/data.json' },
              timestamp: Date.now(),
              severity: 'critical',
              message: `CRITICAL: Agent attempted direct execution of tool "read_file" bypassing the MCP Gateway!`
            }
          })
        });
        addLog('BLOCKED: Antigravity Hook caught direct call and reported bypass anomaly.');

      } else if (scenario === 'anomaly') {
        addLog('1. Requesting checkout for "write_to_file"...');
        addLog('Action: Transmitting command injection verification arguments.');
        
        const checkRes = await fetch(`${httpUrl}/mcp/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            agentId, 
            toolName: 'write_to_file', 
            args: { 
              TargetFile: 'c:/Users/bandi/OneDrive/capstone/app.js',
              CodeContent: 'console.log("hello"); powershell' 
            } 
          })
        });
        const checkout = await checkRes.json();
        
        if (checkout.error) {
          const cleanReason = (checkout.reason || '').includes('terminal/shell') 
            ? 'Request blocked by security: Shell injection pattern detected' 
            : (checkout.reason || checkout.error);
          addLog(`Blocked: Anomaly engine detected injection: ${cleanReason}`);
        }

      } else if (scenario === 'governance') {
        addLog('1. Requesting checkout for system path access...');
        const checkRes = await fetch(`${httpUrl}/mcp/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            agentId, 
            toolName: 'read_file', 
            args: { AbsolutePath: 'C:/Windows/System32/config/SAM' } 
          })
        });
        const checkout = await checkRes.json();
        
        if (checkout.error) {
          addLog(`Blocked: Governance evaluation failed: ${checkout.reason || checkout.error}`);
        }
      }
    } catch (e) {
      addLog(`Simulation Error: ${e.message}`);
    }

    setSimulating(null);
  };

  const handleKillSwitch = async () => {
    addLog('CRITICAL: Master Kill Switch activated! Purged all registry credentials.');
    await triggerKillSwitch();
  };

  const handleReset = async () => {
    addLog('System reset requested. Security hook active.');
    await resetSystem();
    setLogConsole([]);
    setIsUnlocked(false);
  };

  const isShutdown = systemStatus === 'EMERGENCY_SHUTDOWN';

  return (
    <div className="relative min-h-screen flex flex-col bg-[#05070a] overflow-hidden" style={{ height: '100vh' }}>
      
      {/* Toast Notification Container */}
      <ToastSystem toasts={toasts} onDismiss={handleDismissToast} />

      {/* Header */}
      <header style={{ padding: '16px 0 0 0' }}>
        <h1 style={{
          textAlign: 'center',
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '28px',
          fontWeight: 900,
          color: '#00e5ff',
          textShadow: '0 0 20px rgba(0,230,255,0.4)',
          letterSpacing: '4px',
          width: '100%',
          marginBottom: '20px'
        }}>
          AGENT-PASSPORT ZSP GATEWAY
        </h1>
      </header>

      {/* Main Grid Content Area */}
      <main style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        padding: '12px',
        height: 'calc(100vh - 60px)',
        overflow: 'hidden'
      }}>
        
        {/* Left Column */}
        <section className="left-panel" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          height: '100%',
          overflow: 'hidden'
        }}>
          {/* Stats Cards Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <StatCard label="Active Agents" value={activeAgents} color="#00e5ff"/>
            <StatCard label="Blocked Attacks" value={blockedAnomalies} color="#ff0055"/>
            <StatCard label="Credentials Revoked" value={credentialsRevoked} color="#ffaa00"/>
            <StatCard label="System Health" value={systemHealth + '%'} color={healthColor}/>
          </div>

          {/* Node Graph Viewport */}
          <div className="glass-panel" style={{
            flex: 1,
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div className="border-b border-white/5 px-4 py-2 bg-white/[0.01]">
              <h2 className="text-[10px] uppercase tracking-wider text-slate-400" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                Interactive Viewport
              </h2>
            </div>
            <div style={{ flex: 1, height: '100%', minHeight: 0 }}>
              <InteractiveTopologyGrid 
                lastPulse={lastPulse} 
                systemStatus={systemStatus}
                onNodeClick={setSelectedNodeId} 
              />
            </div>
          </div>
        </section>

        {/* Right Column */}
        <section className="right-panel" style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: '8px',
          overflow: 'hidden'
        }}>
          {/* Audit Ledger */}
          <div className="glass-panel" style={{
            flex: '1',
            maxHeight: '33%',
            overflowY: 'auto',
            padding: '12px',
            minHeight: 0,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <KineticAlerts anomalies={anomalies} />
          </div>

          {/* Passport Registry */}
          <div className="glass-panel" style={{
            flex: '1',
            maxHeight: '33%',
            overflowY: 'auto',
            padding: '12px',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}>
            <div className="border-b border-white/5 pb-2 mb-2">
              <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                Active Passport Registry State
              </h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {registryEntries.length === 0 ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  padding: '12px'
                }}>
                  {[
                    { label: 'POLICY VERSION', value: 'v1.0', color: '#00e5ff' },
                    { label: 'SANDBOX', value: 'ISOLATED', color: '#00f5a0' },
                    { label: 'AUDIT CHAIN', value: 'SHA-256', color: '#00e5ff' },
                    { label: 'TTL DAEMON', value: 'ACTIVE', color: '#00f5a0' },
                    { label: 'RATE LIMIT', value: '10/min', color: '#ffaa00' },
                    { label: 'SYSTEM ENV', value: 'SECURE ADK', color: '#00e5ff' },
                  ].map((item, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <span style={{
                        fontFamily: 'JetBrains Mono',
                        fontSize: '9px',
                        color: 'rgba(255,255,255,0.3)',
                        letterSpacing: '1px'
                      }}>{item.label}</span>
                      <span style={{
                        fontFamily: 'Orbitron',
                        fontSize: '12px',
                        color: item.color,
                        fontWeight: '700'
                      }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <table style={{
                  width: '100%',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '11px',
                  borderCollapse: 'collapse'
                }}>
                  <thead>
                    <tr style={{color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)'}}>
                      <th style={{padding: '8px', textAlign:'left'}}>TOKEN REF</th>
                      <th style={{padding: '8px', textAlign:'left'}}>AGENT ID</th>
                      <th style={{padding: '8px', textAlign:'left'}}>TOOL TARGET</th>
                      <th style={{padding: '8px', textAlign:'left'}}>TTL</th>
                      <th style={{padding: '8px', textAlign:'left'}}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registryEntries.map((entry, i) => (
                      <tr key={i} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: entry.status === 'AUTHORIZED'
                          ? '#00f5a0'
                          : '#ffaa00'
                      }}>
                        <td style={{padding: '8px'}}>{entry.tokenRef}</td>
                        <td style={{padding: '8px'}}>{entry.agentId}</td>
                        <td style={{padding: '8px'}}>{entry.toolTarget}</td>
                        <td style={{padding: '8px'}}>
                          {entry.expiresAt ? (
                            <EphemeralTimer expiresAt={entry.expiresAt} />
                          ) : (
                            entry.ttl
                          )}
                        </td>
                        <td style={{padding: '8px'}}>{entry.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Section 3 - Control Buttons Panel */}
          <div className="glass-panel" style={{
            flex: '1',
            maxHeight: '33%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '14px 16px',
            border: '1px solid rgba(0,230,255,0.3)',
            borderRadius: '10px',
            background: 'rgba(255,0,85,0.04)',
            minHeight: 0,
            boxSizing: 'border-box'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(19, 118, 131, 0.15)',
              paddingBottom: '8px',
              marginBottom: '10px'
            }}>
              <span style={{
                fontFamily: 'Orbitron',
                fontSize: '11px',
                color: '#cec2c6',
                letterSpacing: '2px',
                fontWeight: '700'
              }}>
                ⚡ MASTER REVOCATION TERMINAL
              </span>
              
              {isShutdown ? (
                <span style={{
                  fontFamily: 'JetBrains Mono',
                  fontSize: '10px',
                  padding: '3px 10px',
                  border: '1px solid rgba(255,0,85,0.3)',
                  borderRadius: '4px',
                  color: '#ff0055',
                  letterSpacing: '1px'
                }}>
                  🚨 SHIELD DEAD
                </span>
              ) : isUnlocked ? (
                <span style={{
                  fontFamily: 'JetBrains Mono',
                  fontSize: '10px',
                  padding: '3px 10px',
                  border: '1px solid rgba(255,170,0,0.3)',
                  borderRadius: '4px',
                  color: '#ffaa00',
                  letterSpacing: '1px'
                }}>
                  ⚠ SYSTEM ARMED
                </span>
              ) : (
                <span style={{
                  fontFamily: 'JetBrains Mono',
                  fontSize: '10px',
                  padding: '3px 10px',
                  border: '1px solid rgba(0,245,160,0.3)',
                  borderRadius: '4px',
                  color: '#00f5a0',
                  letterSpacing: '1px'
                }}>
                  🛡 SHIELD ENGAGED
                </span>
              )}
            </div>

            {/* Buttons row */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              justifyContent: 'flex-start'
            }}>
              {/* Kill Switch Button */}
              <button
                onClick={handleKillSwitch}
                disabled={!isUnlocked || isShutdown}
                style={{
                  background: isShutdown ? 'rgba(255,0,85,0.05)' : (!isUnlocked ? '#1e293b' : 'rgba(255,0,85,0.15)'),
                  border: isShutdown ? '1px solid rgba(255,0,85,0.2)' : (!isUnlocked ? '1px solid #334155' : '1px solid #ff0055'),
                  color: isShutdown ? 'rgba(255,0,85,0.4)' : (!isUnlocked ? '#64748b' : '#ff0055'),
                  fontFamily: 'Orbitron',
                  fontSize: '10px',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  cursor: (!isUnlocked || isShutdown) ? 'not-allowed' : 'pointer',
                  letterSpacing: '1px',
                  opacity: (!isUnlocked || isShutdown) ? 0.45 : 1,
                  fontWeight: '700'
                }}
              >
                {isShutdown ? 'DEAD' : 'KILL SWITCH'}
              </button>

              {/* Slide Button */}
              {!isShutdown && (
                <button
                  onClick={() => setIsUnlocked(!isUnlocked)}
                  style={{
                    background: 'rgba(0,230,255,0.08)',
                    border: '1px solid rgba(0,230,255,0.3)',
                    color: '#00e5ff',
                    fontFamily: 'Orbitron',
                    fontSize: '10px',
                    padding: '7px 14px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    fontWeight: '700'
                  }}
                >
                  SLIDE
                </button>
              )}

              {/* Release Shield Button */}
              {!isShutdown && (
                <button
                  onClick={() => setIsUnlocked(!isUnlocked)}
                  style={{
                    background: 'rgba(255,170,0,0.08)',
                    border: '1px solid rgba(255,170,0,0.3)',
                    color: '#ffaa00',
                    fontFamily: 'Orbitron',
                    fontSize: '10px',
                    padding: '7px 14px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    fontWeight: '700'
                  }}
                >
                  RELEASE SHIELD
                </button>
              )}

              {/* Re-arm & Reset Button (renders if dead) */}
              {isShutdown && (
                <button
                  onClick={handleReset}
                  style={{
                    background: 'rgba(0,245,160,0.08)',
                    border: '1px solid rgba(0,245,160,0.3)',
                    color: '#00f5a0',
                    fontFamily: 'Orbitron',
                    fontSize: '10px',
                    padding: '7px 14px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    fontWeight: '700'
                  }}
                >
                  RE-ARM & RESET
                </button>
              )}

              {/* Secure Call Bypass */}
              <button
                onClick={() => runSimulator('authorized')}
                disabled={simulating !== null || isShutdown || cooldown > 0}
                style={{
                  background: 'rgba(0,245,160,0.08)',
                  border: '1px solid rgba(0,245,160,0.3)',
                  color: '#00f5a0',
                  fontFamily: 'Orbitron',
                  fontSize: '10px',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  cursor: (simulating !== null || isShutdown || cooldown > 0) ? 'not-allowed' : 'pointer',
                  letterSpacing: '1px',
                  opacity: (simulating !== null || isShutdown || cooldown > 0) ? 0.45 : 1,
                  fontWeight: '700'
                }}
              >
                SECURE CALL BYPASS
              </button>

              {/* Attempt */}
              <button
                onClick={() => runSimulator('bypass')}
                disabled={simulating !== null || isShutdown || cooldown > 0}
                style={{
                  background: 'rgba(255,0,85,0.08)',
                  border: '1px solid rgba(255,0,85,0.3)',
                  color: '#ff0055',
                  fontFamily: 'Orbitron',
                  fontSize: '10px',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  cursor: (simulating !== null || isShutdown || cooldown > 0) ? 'not-allowed' : 'pointer',
                  letterSpacing: '1px',
                  opacity: (simulating !== null || isShutdown || cooldown > 0) ? 0.45 : 1,
                  fontWeight: '700'
                }}
              >
                ATTEMPT
              </button>

              {/* Inject Anomaly */}
              <button
                onClick={() => runSimulator('anomaly')}
                disabled={simulating !== null || isShutdown || cooldown > 0}
                style={{
                  background: 'rgba(121,40,202,0.15)',
                  border: '1px solid rgba(121,40,202,0.4)',
                  color: '#a855f7',
                  fontFamily: 'Orbitron',
                  fontSize: '10px',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  cursor: (simulating !== null || isShutdown || cooldown > 0) ? 'not-allowed' : 'pointer',
                  letterSpacing: '1px',
                  opacity: (simulating !== null || isShutdown || cooldown > 0) ? 0.45 : 1,
                  fontWeight: '700'
                }}
              >
                INJECT ANOMALY
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Log Console Display */}
      <div style={{
        position: 'fixed',
        bottom: '12px',
        left: '12px',
        width: '320px',
        fontSize: '12.5px',
        lineHeight: 1.9,
        color: 'rgba(0, 230, 255, 0.85)',
        background: 'rgba(0, 0, 0, 0.7)',
        border: '1px solid rgba(0, 230, 255, 0.2)',
        padding: '14px 16px',
        borderRadius: '8px',
        maxHeight: '130px',
        overflowY: 'auto',
        zIndex: 40,
        boxSizing: 'border-box',
        fontFamily: "'JetBrains Mono', monospace"
      }}>
        <div style={{
          borderBottom: '1px solid rgba(0, 230, 255, 0.2)',
          paddingBottom: '6px',
          marginBottom: '8px',
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '9px',
          textTransform: 'uppercase',
          color: 'rgba(0, 230, 255, 0.6)'
        }}>
          SIMULATION CONSOLE LOGS {cooldown > 0 && <span style={{ color: '#ffaa00', marginLeft: '6px' }}>COOLDOWN {cooldown}s</span>}
        </div>
        <div>
          {logConsole.length === 0 ? (
            <div style={{ color: 'rgba(0, 230, 255, 0.4)', fontStyle: 'italic' }}>NO LOG ENTRIES</div>
          ) : (
            logConsole.map((log, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                <span>[{log.time}] {log.rawText}</span>
                {log.count > 1 && (
                  <span style={{ color: '#00e5ff', fontWeight: 'bold', backgroundColor: 'rgba(0,229,255,0.1)', padding: '0 4px', borderRadius: '2px' }}>
                    x{log.count}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sliding Node Detail Panel Overlay */}
      <div 
        className={`fixed top-0 right-0 h-full w-80 bg-[#090d16]/95 border-l border-white/10 p-5 shadow-2xl transition-transform duration-300 z-50 flex flex-col gap-4 text-[10px] ${
          selectedNodeId ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            Node Diagnostics
          </h2>
          <button 
            onClick={() => setSelectedNodeId(null)}
            className="text-slate-500 hover:text-slate-200 text-sm select-none"
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {selectedNodeId && (
          <div className="flex-1 flex flex-col gap-3">
            <div>
              <span className="text-slate-500 text-[8px] uppercase">Node Identifier</span>
              <p className="text-cyan-400 font-bold text-xs mt-0.5">{selectedNodeId.toUpperCase()}</p>
            </div>
            
            <div className="w-full h-[1px] bg-white/5"></div>

            {selectedNodeId === 'requestor' ? (
              <>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase font-bold">Node Type</span>
                  <p className="text-slate-300 mt-0.5">User-Facing Agent Client</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Standing Privilege</span>
                  <p className="text-rose-400 font-semibold mt-0.5">ZERO (ZSP Enforced)</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Simulation Identity</span>
                  <p className="text-slate-300 mt-0.5">requestor-agent-01</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Current State</span>
                  <p className={isShutdown ? 'text-rose-400 font-bold' : 'text-[#00f5a0]'}>
                    {isShutdown ? 'LOCKED / REJECTING ALL REQUESTS' : 'ACTIVE / REQUESTING MOCK TOOLS'}
                  </p>
                </div>
              </>
            ) : selectedNodeId === 'hook' ? (
              <>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Hook Target</span>
                  <p className="text-slate-300 mt-0.5">Process runtime SDK (ToolRunner)</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Enforcement state</span>
                  <p className="text-[#00f5a0] font-semibold mt-0.5">ACTIVE & CONTAINED</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Bypass Blocks Logged</span>
                  <p className="text-rose-400 font-bold mt-0.5">
                    {anomalies.filter(a => a.type === 'GATEWAY_BYPASS_ATTEMPT').length} Attacks Blocked
                  </p>
                </div>
              </>
            ) : selectedNodeId === 'gateway' ? (
              <>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Gateway URL</span>
                  <p className="text-slate-300 mt-0.5">{httpUrl}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Sandbox boundary checks</span>
                  <p className="text-slate-300 mt-0.5">normalize() / lowerCase() path containment</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Audit Ledger Integrity</span>
                  <p className="text-cyan-400 mt-0.5 font-bold">CRYPTOGRAPHICALLY CHAINED (SHA-256)</p>
                </div>
              </>
            ) : selectedNodeId === 'governance' ? (
              <>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Policy Authority</span>
                  <p className="text-slate-300 mt-0.5">GovernanceAgent policy engine</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Policy Version</span>
                  <p className="text-purple-400 font-bold mt-0.5">v1 (Rollback support enabled)</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Sandbox boundary checks</span>
                  <p className="text-slate-300 mt-0.5">normalize() / lowerCase() path containment</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Tool Name</span>
                  <p className="text-slate-300 mt-0.5">MCP System Tool ({selectedNodeId})</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Privilege Level</span>
                  <p className="text-amber-400 font-semibold mt-0.5">Ephemeral checkout scope only</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[8px] uppercase">Isolation Layer</span>
                  <p className="text-slate-300 mt-0.5">Virtual Node Container Dry-run</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default App;
