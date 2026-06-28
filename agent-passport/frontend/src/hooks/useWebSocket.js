import { useState, useEffect, useCallback, useRef } from 'react';

// Dynamic backend address resolver (supports local fallback and dynamic tunnels/hosting)
const getBackendUrls = () => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  return {
    ws: isLocal ? 'ws://127.0.0.1:4000' : `wss://${hostname}`,
    http: isLocal ? 'http://127.0.0.1:4000' : `https://${hostname}`
  };
};

const defaultBackend = getBackendUrls();

export function useWebSocket(url = defaultBackend.ws, onMessage) {
  const [isConnected, setIsConnected] = useState(false);
  const [systemStatus, setSystemStatus] = useState('ACTIVE');
  const [activeGrants, setActiveGrants] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [lastPulse, setLastPulse] = useState(null);
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Keep onMessageRef in sync to avoid reconnect loops if it's not memoized
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    console.log('[Dashboard WebSocket] Connecting to', url);
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[Dashboard WebSocket] Connected successfully');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;
        
        if (onMessageRef.current) {
          onMessageRef.current(payload);
        }
        
        switch (type) {
          case 'initial_sync':
            setSystemStatus(data.status);
            setActiveGrants(data.activeGrants || []);
            setAnomalies((data.anomalies || []).filter(a => a.type !== 'DESTRUCTIVE_COMMAND'));
            break;
          
          case 'registry_update':
            setActiveGrants(data || []);
            break;
          
          case 'threat_alert':
            if (data && data.type !== 'DESTRUCTIVE_COMMAND') {
              setAnomalies((prev) => [data, ...prev].slice(0, 100)); // cap at 100 alerts
            }
            break;
          
          case 'request_pulse':
            setLastPulse({ ...data, timestamp: Date.now() });
            break;
          
          case 'kill_switch_triggered':
            setSystemStatus('EMERGENCY_SHUTDOWN');
            setActiveGrants([]);
            if (onMessageRef.current) {
              onMessageRef.current({ type: 'system_status', data: 'EMERGENCY_SHUTDOWN' });
            }
            break;
          
          case 'system_reset':
            setSystemStatus('ACTIVE');
            setActiveGrants([]);
            setAnomalies([]);
            setLastPulse(null);
            break;

          default:
            console.log('[Dashboard WebSocket] Unhandled message type:', type);
        }
      } catch (e) {
        console.error('[Dashboard WebSocket] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      console.log('[Dashboard WebSocket] Connection closed');
      setIsConnected(false);
      
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('[Dashboard WebSocket] Socket error:', err);
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // REST Triggers
  const triggerKillSwitch = useCallback(async () => {
    try {
      const res = await fetch(`${defaultBackend.http}/api/kill-switch`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      console.error('Failed to trigger kill switch', e);
      return { success: false, error: e.message };
    }
  }, []);

  const resetSystem = useCallback(async () => {
    try {
      const res = await fetch(`${defaultBackend.http}/api/reset`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      console.error('Failed to reset system', e);
      return { success: false, error: e.message };
    }
  }, []);

  return {
    isConnected,
    systemStatus,
    activeGrants,
    anomalies,
    lastPulse,
    triggerKillSwitch,
    resetSystem
  };
}
export default useWebSocket;
