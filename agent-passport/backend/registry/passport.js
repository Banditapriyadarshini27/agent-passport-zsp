import crypto from 'crypto';

class PassportRegistry {
  constructor() {
    // Map of token -> { agentId, toolName, expiresAt, maxUses, uses }
    this.tokens = new Map();
    // Set of registered agents and baseline policies
    this.agents = new Map([
      ['requestor-agent-01', { name: 'Primary Requestor', roles: ['user-facing'] }]
    ]);
    this.onExpireCallback = null;
    
    // Start background sweeping daemon to enforce hard TTL limits
    this.startSweeper(500);
  }

  // Register callback for expiration events
  onExpire(callback) {
    this.onExpireCallback = callback;
  }

  startSweeper(intervalMs) {
    setInterval(() => {
      const now = Date.now();
      for (const [token, grant] of this.tokens.entries()) {
        if (now > grant.expiresAt) {
          this.tokens.delete(token);
          console.log(`\x1b[31m[Passport Registry] Ephemeral token expired (TTL=0): ${token}\x1b[0m`);
          if (this.onExpireCallback) {
            this.onExpireCallback(grant);
          }
        }
      }
    }, intervalMs);
  }

  // Check out an ephemeral permission
  checkout(agentId, toolName, durationMs = 8000, maxUses = 1) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent '${agentId}' is not registered in the system.`);
    }

    const token = `token_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = Date.now() + durationMs;

    const grant = {
      token,
      agentId,
      toolName,
      expiresAt,
      maxUses,
      uses: 0,
      createdAt: Date.now()
    };

    this.tokens.set(token, grant);
    return grant;
  }

  // Validate if a token is valid for a given agent and tool
  validate(token, agentId, toolName) {
    const grant = this.tokens.get(token);

    if (!grant) {
      return { valid: false, reason: 'Token not found or already revoked' };
    }

    if (grant.agentId !== agentId) {
      return { valid: false, reason: 'Token agent mismatch' };
    }

    if (grant.toolName !== toolName && grant.toolName !== '*') {
      return { valid: false, reason: `Token is not valid for tool '${toolName}'` };
    }

    if (Date.now() > grant.expiresAt) {
      this.tokens.delete(token); // Cleanup expired
      if (this.onExpireCallback) this.onExpireCallback(grant);
      return { valid: false, reason: 'Token has expired' };
    }

    if (grant.uses >= grant.maxUses) {
      this.tokens.delete(token); // Cleanup exhausted
      return { valid: false, reason: 'Token usage limit exceeded' };
    }

    grant.uses += 1;
    if (grant.uses >= grant.maxUses) {
      this.tokens.delete(token); // Consume token if single-use
    }

    return { valid: true, grant };
  }

  // Active grants list
  getActiveGrants() {
    const now = Date.now();
    const active = [];
    for (const [token, grant] of this.tokens.entries()) {
      if (now <= grant.expiresAt) {
        active.push(grant);
      } else {
        this.tokens.delete(token); // Prune on read
        if (this.onExpireCallback) this.onExpireCallback(grant);
      }
    }
    return active;
  }

  // Flush all active tokens (Kill Switch)
  flush() {
    const count = this.tokens.size;
    this.tokens.clear();
    return count;
  }
}

export const registry = new PassportRegistry();
