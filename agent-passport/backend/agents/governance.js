import path from 'path';

class GovernanceAgent {
  constructor() {
    // Tool permissions mapping based on Agent roles
    this.rolePolicies = {
      'user-facing': {
        allowedTools: ['read_file', 'write_to_file', 'search_web', 'list_dir'],
        maxDurationMs: 8000,
        requiresApproval: ['write_to_file'] // Dangerous tools that need human/elevated consent
      }
    };
  }

  evaluateRequest(agentId, agentRole, toolName, args = {}) {
    const policy = this.rolePolicies[agentRole];

    if (!policy) {
      return {
        approved: false,
        reason: `No policy defined for agent role '${agentRole}'`,
        severity: 'high'
      };
    }

    // Check if tool is allowed in role policy
    if (!policy.allowedTools.includes(toolName) && !policy.allowedTools.includes('*')) {
      return {
        approved: false,
        reason: `Tool '${toolName}' is not authorized for role '${agentRole}'`,
        severity: 'high'
      };
    }

    // Check arguments for path traversal or dangerous targets
    if (args.TargetFile || args.AbsolutePath || args.DirectoryPath) {
      const targetPath = args.TargetFile || args.AbsolutePath || args.DirectoryPath;
      
      // Prevent directory traversal attacks
      if (typeof targetPath === 'string') {
        const resolvedPath = path.normalize(targetPath).toLowerCase();
        
        // Simple safety check: Target path must be relative or stay within the workspace boundary
        // We block any absolute path outside capstone, and any ".." trying to escape
        if (resolvedPath.includes('..') || 
            (path.isAbsolute(targetPath) && !resolvedPath.startsWith('c:\\users\\bandi\\onedrive\\capstone'))) {
          return {
            approved: false,
            reason: `Path traversal detected. Access to path '${targetPath}' outside workspace is blocked.`,
            severity: 'critical'
          };
        }
      }
    }

    // Check if tool requires manual approval
    const requiresMfa = policy.requiresApproval.includes(toolName);
    const durationMs = policy.maxDurationMs;

    return {
      approved: true,
      requiresMfa,
      durationMs,
      maxUses: 1, // Single-use tokens by default for ZSP
      reason: requiresMfa 
        ? `Request approved conditionally: '${toolName}' requires elevated confirmation`
        : `Request approved automatically under '${agentRole}' policy`
    };
  }
}

export const governanceAgent = new GovernanceAgent();
