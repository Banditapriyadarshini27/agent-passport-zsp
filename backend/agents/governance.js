// ==============================================================================
// DECLARATIVE GOVERNANCE ENGINE (governance.js)
// ==============================================================================
// WHAT THIS FILE DOES:
// Evaluates agent requests against security rules defined in policies.yaml.
// It loads declarative rules at startup and checks tool permissions, path restrictions,
// and TTL limits for every checkout request.
//
// WHY IT'S STRUCTURED THIS WAY:
// Hardcoded if/else rules have been replaced by a dynamic policy lookup map.
// If an agent is not found in policies.yaml, it FAILS CLOSED by default (denying access).
//
// NODE.JS / JS CONCEPTS FOR BEGINNERS:
// 1. ES Modules: Uses 'import' and 'export' syntax instead of 'require()'.
// 2. fs.readFileSync + jsyaml.load: Loads file synchronously into memory at boot time.
// 3. Map: High-performance key-value data structure for fast policy lookups.
// 4. Fail Closed: Security design principle where missing configuration defaults to DENIED.
// ==============================================================================

import fs from 'fs';
import path from 'path';
import jsyaml from 'js-yaml';
import { fileURLToPath } from 'url';

// Convert import.meta.url into a standard file directory path for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory Map storing loaded agent policy rules (agentId -> policy object)
const policiesMap = new Map();

/**
 * Loads and parses policies.yaml synchronously on server startup.
 */
export function loadPolicies() {
  try {
    const policyPath = path.join(__dirname, '../policies/policies.yaml');
    const yamlText = fs.readFileSync(policyPath, 'utf8');
    
    // Parse raw YAML string into JavaScript array of objects
    const policiesList = jsyaml.load(yamlText) || [];

    policiesMap.clear();
    for (const p of policiesList) {
      if (p && p.agent) {
        policiesMap.set(p.agent, p);
      }
    }
    console.log(`[Governance Engine] Successfully loaded ${policiesMap.size} declarative agent policies from policies.yaml`);
  } catch (err) {
    console.error(`[Governance Engine] CRITICAL: Failed to load policies.yaml file: ${err.message}`);
  }
}

// Automatically load policies when module is imported
loadPolicies();

/**
 * Main governance evaluation function.
 * Evaluates whether an agent request is permitted under its declarative policy.
 *
 * @param {string} agentId - ID of the requesting agent (e.g. 'requestor-agent-01')
 * @param {string} param2 - Tool name or role (handles signature overloads)
 * @param {object} param3 - Tool arguments or tool name
 * @param {object} [param4] - Tool arguments if role was passed as param2
 * @returns {{ allowed: boolean, approved: boolean, reason: string, max_ttl_seconds?: number, durationMs?: number, severity?: string }}
 */
export function evaluateRequest(agentId, param2, param3, param4) {
  // Support both (agentId, toolName, args) AND legacy (agentId, role, toolName, args)
  let toolName = param2;
  let args = param3 || {};

  if (typeof param3 === 'string') {
    toolName = param3;
    args = param4 || {};
  }

  // --------------------------------------------------------------------------
  // CHECK 1: POLICY LOOKUP & FAIL CLOSED PRINCIPLE
  // WHAT THIS DOES: Looks up agent policy entry in policiesMap.
  // WHY: If an agent has no policy entry, we deny access immediately (Fail Closed).
  // --------------------------------------------------------------------------
  const policy = policiesMap.get(agentId);

  if (!policy) {
    return {
      allowed: false,
      approved: false,
      reason: `Access Denied: No governance policy defined for agent '${agentId}'. System failed closed by default.`,
      severity: 'high'
    };
  }

  // --------------------------------------------------------------------------
  // CHECK 2: TOOL AUTHORIZATION
  // WHAT THIS DOES: Verifies if the requested toolName exists in allowed_tools.
  // WHY: Enforces Least Privilege - agents can only run explicitly allowed tools.
  // --------------------------------------------------------------------------
  const allowedTools = policy.allowed_tools || [];
  const isToolAllowed = allowedTools.includes(toolName) || allowedTools.includes('*');

  if (!isToolAllowed) {
    return {
      allowed: false,
      approved: false,
      reason: `Access Denied: Tool '${toolName}' is not allowed for agent '${agentId}'. Authorized tools: [${allowedTools.join(', ')}].`,
      severity: 'high'
    };
  }

  // --------------------------------------------------------------------------
  // CHECK 3: DENIED PATHS & PATH TRAVERSAL INSPECTION
  // WHAT THIS DOES: Normalizes file paths in arguments and checks against denied_paths.
  // WHY: Blocks path traversal attacks and unauthorized access to OS directories.
  // --------------------------------------------------------------------------
  const targetPath = args.TargetFile || args.AbsolutePath || args.DirectoryPath || args.path;

  if (targetPath && typeof targetPath === 'string') {
    const normalizedPath = path.normalize(targetPath).toLowerCase();

    // Block path traversal attempt containing '..'
    if (normalizedPath.includes('..')) {
      return {
        allowed: false,
        approved: false,
        reason: `Access Denied: Directory traversal ('..') detected in path '${targetPath}'.`,
        severity: 'critical'
      };
    }

    // Check target path against forbidden rules in policy's denied_paths
    const deniedPaths = policy.denied_paths || [];
    for (const forbidden of deniedPaths) {
      const normalizedForbidden = path.normalize(forbidden).toLowerCase();
      if (normalizedPath.includes(normalizedForbidden) || normalizedPath.startsWith(normalizedForbidden)) {
        return {
          allowed: false,
          approved: false,
          reason: `Access Denied: Path '${targetPath}' violates prohibited path policy '${forbidden}' for agent '${agentId}'.`,
          severity: 'critical'
        };
      }
    }
  }

  // --------------------------------------------------------------------------
  // SUCCESSFUL EVALUATION: RETURN AUTHORIZATION RESULT
  // WHAT THIS DOES: Returns allowed: true along with max TTL seconds.
  // WHY: Gives the gateway server the precise TTL to assign to the ephemeral token.
  // --------------------------------------------------------------------------
  const maxTtlSeconds = policy.max_ttl_seconds || 5;
  const durationMs = maxTtlSeconds * 1000;

  return {
    allowed: true,
    approved: true,
    max_ttl_seconds: maxTtlSeconds,
    durationMs: durationMs,
    maxUses: 1,
    reason: `Access Granted: Tool '${toolName}' authorized for agent '${agentId}' under policy (TTL: ${maxTtlSeconds}s).`
  };
}

// GovernanceAgent Class Wrapper for backwards compatibility
class GovernanceAgent {
  evaluateRequest(agentId, param2, param3, param4) {
    return evaluateRequest(agentId, param2, param3, param4);
  }
}

export const governanceAgent = new GovernanceAgent();
