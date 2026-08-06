import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';
import { registry } from '../registry/passport.js';
import { governanceAgent } from '../agents/governance.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Serve static React production build
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 4000;

// Security variables
const anomalies = [];
const events = [];
let systemStatus = 'ACTIVE';

// 1. Cryptographic Hash-Chain Log Setup
const auditChain = [];
const SERVER_SECRET = crypto.randomBytes(32).toString('hex'); // For signing proofs

function addAuditLog(action, data) {
  const timestamp = Date.now();
  const dataStr = JSON.stringify(data);
  const previousHash = auditChain.length > 0 ? auditChain[auditChain.length - 1].hash : '0';
  
  const hash = crypto.createHash('sha256')
    .update(action + dataStr + timestamp + previousHash)
    .digest('hex');

  const logEntry = {
    id: `log_${timestamp}_${crypto.randomBytes(4).toString('hex')}`,
    action,
    data,
    timestamp,
    previousHash,
    hash
  };

  auditChain.push(logEntry);
  return logEntry;
}

// Write the genesis block to anchor the chain
addAuditLog('GENESIS_BLOCK', { status: 'Audit Chain Initialized' });

// 2. Policy Versioning & Rollback Store
const policyHistory = [
  {
    version: 1,
    timestamp: Date.now(),
    rules: {
      allowedTools: ['read_file', 'write_to_file', 'search_web', 'list_dir'],
      requiresApproval: ['write_to_file'],
      maxDurationMs: 8000
    }
  }
];
let currentPolicyVersion = 1;

// 3. Rate Limiting Monitor Map (agentId -> timestamps[])
const rateLimitMap = new Map();

// 4. Behavioral Baseline Monitor Map (agentId -> Set of tools used in window)
const behavioralMap = new Map();

// Helper: Broadcast WebSocket messages
function broadcast(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// 5. Connect Registry Expiration Sweep to WebSockets
registry.onExpire((expiredGrant) => {
  addAuditLog('TOKEN_AUTO_REVOKED', { token: expiredGrant.token, agentId: expiredGrant.agentId });
  broadcast('request_pulse', { 
    agentId: expiredGrant.agentId, 
    toolName: expiredGrant.toolName, 
    approved: false, 
    status: 'EXPIRED_TTL' 
  });
  broadcast('registry_update', registry.getActiveGrants());
});

// 6. Isolated Sandbox Execution Layer
function runInSandbox(toolName, args) {
  console.log(`[Sandbox Execution] Isolating call for tool '${toolName}'...`);
  
  const argsStr = JSON.stringify(args || '').toLowerCase();
  
  if (argsStr.includes('sandbox.bypass') || argsStr.includes('/var/run/docker.sock')) {
    throw new Error('Sandbox violation: Attempted to mount docker socket or bypass container boundary.');
  }

  return {
    sandboxed: true,
    sandboxId: `sb_${crypto.randomBytes(8).toString('hex')}`,
    timestamp: Date.now()
  };
}

// Anomaly Detection Engine
function runAnomalyCheck(agentId, toolName, args) {
  const argsString = JSON.stringify(args || {}).toLowerCase();
  
  const patterns = [
    { pattern: /rm\s+-rf/, type: 'DESTRUCTIVE_COMMAND', description: 'Attempt to execute recursive deletion (rm -rf)' },
    { pattern: /powershell|cmd\.exe|bash|sh\s+/, type: 'SHELL_INJECTION', description: 'Attempt to run terminal/shell shells' },
    { pattern: /union\s+select|select\s+.*\s+from|insert\s+into/, type: 'SQL_INJECTION', description: 'SQL Injection pattern detected in arguments' },
    { pattern: /\/etc\/passwd|c:\\windows|system32/i, type: 'SYSTEM_FILE_ACCESS', description: 'Unauthorized access to OS system directory' },
    { pattern: /wget|curl|chmod|chown/, type: 'SYSTEM_MODIFICATION', description: 'Unauthorized networking or file permission command' }
  ];

  for (const { pattern, type, description } of patterns) {
    if (pattern.test(argsString)) {
      return { detected: true, type, description, severity: 'critical' };
    }
  }

  const now = Date.now();
  if (!rateLimitMap.has(agentId)) {
    rateLimitMap.set(agentId, []);
  }
  const timestamps = rateLimitMap.get(agentId).filter(t => now - t < 60000);
  timestamps.push(now);
  rateLimitMap.set(agentId, timestamps);

  if (timestamps.length > 10) {
    registry.flush();
    return {
      detected: true,
      type: 'RATE_LIMIT_EXCEEDED',
      description: 'Agent breached limit of 10 calls/minute. Ephemeral registry flushed, initiating privilege review.',
      severity: 'critical'
    };
  }

  if (!behavioralMap.has(agentId)) {
    behavioralMap.set(agentId, new Set());
  }
  const toolSet = behavioralMap.get(agentId);
  toolSet.add(toolName);
  
  if (toolSet.has('write_to_file') && toolSet.has('search_web')) {
    toolSet.clear();
    return {
      detected: true,
      type: 'BEHAVIORAL_ANOMALY',
      description: `Unusual tool combination observed: agent requested both 'write_to_file' and 'search_web' within same epoch context.`,
      severity: 'medium'
    };
  }

  return { detected: false };
}

// --- REST Endpoints ---

app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px; background: #05070a; color: #cfd6e4; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box;">
      <div style="background: rgba(9, 13, 22, 0.7); border: 1px solid rgba(255, 255, 255, 0.05); padding: 40px; border-radius: 12px; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(12px);">
        <h1 style="color: #00e5ff; font-size: 24px; margin-bottom: 16px; font-weight: 700;">Agent-Passport Gateway</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #a0aec0; margin-bottom: 24px;">The security middleware backend is running successfully on port <strong style="color: #ffffff;">4000</strong>.</p>
        <p style="font-size: 13px; line-height: 1.5; color: #718096; margin-bottom: 30px;">To open the visual control centre, navigate to the frontend URL on port <strong style="color: #ffffff;">5173</strong>.</p>
        <a href="http://127.0.0.1:5173" style="background: #00f5a0; color: #020306; font-size: 13px; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; transition: all 0.2s; box-shadow: 0 4px 14px rgba(0, 245, 160, 0.3);">Open Dashboard (Port 5173)</a>
      </div>
    </div>
  `);
});

// Check out ephemeral token (Passport)
// ------------------------------------------------------------------------------
// WHAT THIS ROUTE DOES:
// Intercepts checkout requests from agents seeking short-lived access credentials.
// Evaluates requests against governance policies and anomaly engines before issuing a token.
//
// WHY IT'S STRUCTURED THIS WAY:
// Calling governanceAgent.evaluateRequest(agentId, toolName, args) delegates security
// decisions to our declarative YAML policy engine. Denials broadcast detailed reasons
// to both the requesting agent and the live WebSocket security control center.
//
// NODE.JS / EXPRESS / WEBSOCKET CONCEPTS FOR BEGINNERS:
// 1. app.post('/mcp/checkout', (req, res) => ...): Express route handler for HTTP POST requests.
// 2. HTTP 403 Forbidden: Standard HTTP code returned when access is rejected by policy.
// 3. WebSocket Broadcast: Pushes real-time alerts instantly to all connected dashboard browsers.
// ------------------------------------------------------------------------------
app.post('/mcp/checkout', (req, res) => {
  if (systemStatus === 'EMERGENCY_SHUTDOWN') {
    return res.status(403).json({ error: 'System is locked down under emergency Kill Switch' });
  }

  const { agentId, toolName, args } = req.body;
  
  console.log(`[MCP Server] Checkout request received from agent '${agentId}' for tool '${toolName}'`);

  // Step 1: Run security anomaly engine check
  const anomaly = runAnomalyCheck(agentId, toolName, args);
  if (anomaly.detected) {
    const alert = {
      id: `alert_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      agentId,
      toolName,
      type: anomaly.type,
      description: anomaly.description,
      severity: anomaly.severity,
      timestamp: Date.now()
    };
    anomalies.push(alert);
    addAuditLog('ANOMALY_BLOCKED', alert);
    broadcast('threat_alert', alert);
    
    return res.status(400).json({ 
      error: 'SECURITY EXCEPTION', 
      reason: `Request blocked by security: ${anomaly.description}` 
    });
  }

  // Step 2: Evaluate request against declarative policies in policies.yaml
  const evaluation = governanceAgent.evaluateRequest(agentId, toolName, args);
  
  // Step 3: Handle Governance Denial (Fail Closed / Policy Violation)
  if (!evaluation.allowed && !evaluation.approved) {
    const alert = {
      id: `alert_${Date.now()}`,
      agentId,
      toolName,
      type: 'GOVERNANCE_REJECTION',
      description: evaluation.reason,
      severity: evaluation.severity || 'high',
      timestamp: Date.now()
    };
    anomalies.push(alert);
    addAuditLog('GOVERNANCE_REJECTED', alert);
    
    // Broadcast threat alert and pulse notification to WebSocket dashboard
    broadcast('threat_alert', alert);
    broadcast('request_pulse', {
      agentId,
      toolName,
      approved: false,
      status: 'GOVERNANCE_REJECTION',
      reason: evaluation.reason
    });
    
    // Return explicit denial reason to requesting agent client
    return res.status(403).json({
      error: 'Governance Rejection',
      allowed: false,
      reason: evaluation.reason
    });
  }

  // Step 4: Issue Ephemeral Passport Grant (TTL governed by policies.yaml)
  const ttlMs = evaluation.durationMs || (evaluation.max_ttl_seconds ? evaluation.max_ttl_seconds * 1000 : 5000);
  const grant = registry.checkout(agentId, toolName, ttlMs, evaluation.maxUses || 1);
  
  addAuditLog('PASSPORT_ISSUED', { token: grant.token, agentId, toolName, ttlSeconds: ttlMs / 1000 });
  
  // Broadcast successful authorization pulse to WebSocket dashboard
  broadcast('request_pulse', { 
    agentId, 
    toolName, 
    approved: true, 
    token: grant.token, 
    status: 'AUTHORIZED', 
    expiresAt: grant.expiresAt 
  });
  broadcast('registry_update', registry.getActiveGrants());

  // Return success response with token to requesting agent
  res.json({
    success: true,
    allowed: true,
    token: grant.token,
    expiresAt: grant.expiresAt,
    requiresMfa: evaluation.requiresMfa || false,
    reason: evaluation.reason
  });
});

// Execute intercepted Tool call (with Sandbox Isolation)
app.post('/mcp/execute', (req, res) => {
  if (systemStatus === 'EMERGENCY_SHUTDOWN') {
    return res.status(403).json({ error: 'System is locked down under emergency Kill Switch' });
  }

  const { agentId, toolName, token, args } = req.body;

  const validation = registry.validate(token, agentId, toolName);
  if (!validation.valid) {
    const alert = {
      id: `alert_${Date.now()}`,
      agentId,
      toolName,
      type: 'INVALID_PASSPORT_TOKEN',
      description: `Rejected tool execution: ${validation.reason}`,
      severity: 'high',
      timestamp: Date.now()
    };
    anomalies.push(alert);
    addAuditLog('EXECUTION_BLOCKED_INVALID_TOKEN', alert);
    broadcast('threat_alert', alert);
    broadcast('request_pulse', { agentId, toolName, approved: false, status: 'EXPIRED_OR_INVALID_TOKEN' });
    broadcast('registry_update', registry.getActiveGrants());
    
    return res.status(401).json({ error: 'Access Denied', reason: validation.reason });
  }

  const anomaly = runAnomalyCheck(agentId, toolName, args);
  if (anomaly.detected) {
    const alert = {
      id: `alert_${Date.now()}`,
      agentId,
      toolName,
      type: anomaly.type,
      description: `Blocked on execution check: ${anomaly.description}`,
      severity: anomaly.severity,
      timestamp: Date.now()
    };
    anomalies.push(alert);
    addAuditLog('EXECUTION_BLOCKED_ANOMALY', alert);
    broadcast('threat_alert', alert);
    broadcast('request_pulse', { agentId, toolName, approved: false, status: 'EXECUTION_ANOMALY' });
    
    return res.status(400).json({ error: 'Security Violation', reason: anomaly.description });
  }

  let sandboxInfo;
  try {
    sandboxInfo = runInSandbox(toolName, args);
  } catch (err) {
    const alert = {
      id: `alert_${Date.now()}`,
      agentId,
      toolName,
      type: 'SANDBOX_VIOLATION',
      description: `Sandbox Isolated Error: ${err.message}`,
      severity: 'critical',
      timestamp: Date.now()
    };
    anomalies.push(alert);
    addAuditLog('SANDBOX_VIOLATION', alert);
    broadcast('threat_alert', alert);
    broadcast('request_pulse', { agentId, toolName, approved: false, status: 'SANDBOX_VIOLATION' });
    return res.status(400).json({ error: 'Sandbox Violation', reason: err.message });
  }

  const logEntry = { agentId, toolName, timestamp: Date.now(), status: 'SUCCESS', args, sandboxId: sandboxInfo.sandboxId };
  events.push(logEntry);
  addAuditLog('TOOL_EXECUTED', logEntry);

  broadcast('request_pulse', { agentId, toolName, approved: true, status: 'SUCCESS' });
  broadcast('registry_update', registry.getActiveGrants());

  let result = `Executed tool '${toolName}' successfully.`;
  if (toolName === 'read_file') {
    result = `[READ FILE OUTPUT] Content of target file: "Welcome to the capstone project. Security is active."`;
  } else if (toolName === 'write_to_file') {
    result = `[WRITE FILE OUTPUT] Successfully written bytes to ${args.TargetFile || 'target'}`;
  } else if (toolName === 'search_web') {
    result = `[WEB SEARCH OUTPUT] Results for query "${args.query}": Security best practices active.`;
  } else if (toolName === 'list_dir') {
    result = `[LIST DIR OUTPUT] Found 4 entries in directory ${args.DirectoryPath || '.'}`;
  }

  res.json({ success: true, result });
});

app.post('/api/report-bypass', (req, res) => {
  const { event, data } = req.body;
  if (event === 'anomaly_detected') {
    const alert = {
      id: `bypass_${Date.now()}`,
      agentId: data.agentId,
      toolName: data.tool,
      type: data.type,
      description: data.message,
      severity: data.severity,
      timestamp: data.timestamp
    };
    anomalies.push(alert);
    addAuditLog('GATEWAY_BYPASS_REPORTED', alert);
    broadcast('threat_alert', alert);
    broadcast('request_pulse', { agentId: data.agentId, toolName: data.tool, approved: false, status: 'CRITICAL_BYPASS' });
  }
  res.json({ accepted: true });
});

app.post('/api/kill-switch', (req, res) => {
  console.log('\x1b[41m\x1b[37m[KILL SWITCH] EMERGENCY ACTIVATED. REVOKING ALL TOKENS.\x1b[0m');
  systemStatus = 'EMERGENCY_SHUTDOWN';
  
  const flushedCount = registry.flush();
  const alert = {
    id: `kill_${Date.now()}`,
    agentId: 'SYSTEM',
    toolName: 'ALL',
    type: 'EMERGENCY_SHUTDOWN',
    description: `Master Kill Switch activated! Flushed ${flushedCount} active credentials. All traffic is blocked.`,
    severity: 'critical',
    timestamp: Date.now()
  };
  
  anomalies.push(alert);
  addAuditLog('EMERGENCY_KILL_SWITCH', { flushedCount });
  broadcast('kill_switch_triggered', { flushed: flushedCount });
  broadcast('threat_alert', alert);
  broadcast('registry_update', []);
  
  res.json({ success: true, message: 'Emergency Kill Switch completed.', flushed: flushedCount });
});

app.post('/api/reset', (req, res) => {
  systemStatus = 'ACTIVE';
  registry.flush();
  anomalies.length = 0;
  events.length = 0;
  rateLimitMap.clear();
  behavioralMap.clear();
  
  addAuditLog('SYSTEM_RESET', { status: 'System reset to ACTIVE baseline' });
  
  broadcast('system_reset', {});
  broadcast('registry_update', []);
  console.log('[MCP Server] System reset to ACTIVE state.');
  res.json({ success: true });
});

app.get('/api/audit/verify', (req, res) => {
  let isChainValid = true;
  let faultIndex = -1;

  for (let i = 0; i < auditChain.length; i++) {
    const entry = auditChain[i];
    
    if (i === 0 && entry.previousHash !== '0') {
      isChainValid = false;
      faultIndex = 0;
      break;
    }
    
    if (i > 0 && entry.previousHash !== auditChain[i - 1].hash) {
      isChainValid = false;
      faultIndex = i;
      break;
    }

    const dataStr = JSON.stringify(entry.data);
    const recomputedHash = crypto.createHash('sha256')
      .update(entry.action + dataStr + entry.timestamp + entry.previousHash)
      .digest('hex');

    if (entry.hash !== recomputedHash) {
      isChainValid = false;
      faultIndex = i;
      break;
    }
  }

  const tailHash = auditChain.length > 0 ? auditChain[auditChain.length - 1].hash : '0';
  const preciseTimestamp = new Date().toISOString();
  
  const proofSignature = crypto.createHmac('sha256', SERVER_SECRET)
    .update(tailHash + preciseTimestamp + isChainValid)
    .digest('hex');

  res.json({
    status: 'INTEGRITY_VERIFICATION',
    valid: isChainValid,
    faultIndex,
    chainLength: auditChain.length,
    tailHash,
    preciseTimestamp,
    cryptographicProof: proofSignature
  });
});

app.get('/api/policies', (req, res) => {
  res.json({
    currentVersion: currentPolicyVersion,
    history: policyHistory
  });
});

app.post('/api/policies/update', (req, res) => {
  const { maxDurationMs, allowedTools, requiresApproval } = req.body;
  
  const newRules = {
    maxDurationMs: Number(maxDurationMs) || 8000,
    allowedTools: Array.isArray(allowedTools) ? allowedTools : ['read_file', 'list_dir'],
    requiresApproval: Array.isArray(requiresApproval) ? requiresApproval : ['write_to_file']
  };

  const nextVersion = policyHistory.length + 1;
  const newPolicy = {
    version: nextVersion,
    timestamp: Date.now(),
    rules: newRules
  };

  policyHistory.push(newPolicy);
  currentPolicyVersion = nextVersion;
  
  addAuditLog('POLICY_UPDATED', { version: nextVersion, rules: newRules });
  console.log(`[MCP Server] Policy upgraded to Version ${nextVersion}`);
  res.json({ success: true, policy: newPolicy });
});

app.post('/api/policies/rollback', (req, res) => {
  const { version } = req.body;
  const target = policyHistory.find(p => p.version === Number(version));
  
  if (!target) {
    return res.status(404).json({ error: 'Policy version not found' });
  }

  currentPolicyVersion = target.version;
  addAuditLog('POLICY_ROLLED_BACK', { version: target.version });
  console.log(`[MCP Server] Policy rolled back to Version ${target.version}`);
  res.json({ success: true, activeVersion: currentPolicyVersion });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: systemStatus,
    activeGrants: registry.getActiveGrants(),
    anomalies,
    events: events.slice(-10),
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected (React Dashboard)');
  
  ws.send(JSON.stringify({ 
    type: 'initial_sync', 
    data: {
      status: systemStatus,
      activeGrants: registry.getActiveGrants(),
      anomalies
    },
    timestamp: Date.now()
  }));

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m[MCP Server] Gateway running at http://127.0.0.1:${PORT}\x1b[0m`);
});
