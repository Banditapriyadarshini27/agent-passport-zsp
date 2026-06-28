import http from 'http';

// We simulate a secure environment by locking down a mock tool SDK
// or monkey-patching global requests. In our system, the Requestor Agent
// uses a standard "ToolRunner" to make operations. 

class AntigravityHook {
  constructor() {
    this.mcpServerUrl = 'http://127.0.0.1:4000/mcp';
    this.wsServerUrl = 'ws://127.0.0.1:4000';
    this.locked = false;
  }

  // Lock down the process execution context
  lockdown(toolRunner) {
    if (this.locked) return;
    this.locked = true;

    console.log('\x1b[36m[Antigravity Hook] Securing agent execution environment. Direct tool access locked.\x1b[0m');

    // Intercept the execution method of the ToolRunner
    const originalExecute = toolRunner.executeDirectly;
    
    // We override the direct execution method to strictly throw and alert
    toolRunner.executeDirectly = async (toolName, args, bypassToken) => {
      // Check if this was a deliberate bypass attempt (no gateway token, direct tool call)
      console.log(`\x1b[33m[Antigravity Hook] Intercepted call to tool: '${toolName}'\x1b[0m`);
      
      // If we attempt direct bypass (no passport verification via Gateway)
      if (!bypassToken || !bypassToken.startsWith('token_')) {
        const securityThreat = {
          event: 'anomaly_detected',
          data: {
            agentId: 'requestor-agent-01',
            type: 'GATEWAY_BYPASS_ATTEMPT',
            tool: toolName,
            payload: args,
            timestamp: Date.now(),
            severity: 'critical',
            message: `CRITICAL: Agent attempted direct execution of tool '${toolName}' bypassing the MCP Gateway!`
          }
        };

        // Report bypass attempt to the MCP Gateway
        await this.reportBypass(securityThreat);
        
        throw new Error(`SECURITY EXCEPTION: Direct execution of tool '${toolName}' is prohibited. All tools must be executed via the Agent-Passport MCP Gateway.`);
      }

      // If authorized, route it properly (or continue to Gateway execution)
      return originalExecute.call(toolRunner, toolName, args, bypassToken);
    };
  }

  async reportBypass(threatPayload) {
    return new Promise((resolve) => {
      const dataStr = JSON.stringify(threatPayload);
      const req = http.request(
        'http://127.0.0.1:4000/api/report-bypass',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': dataStr.length
          }
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve(true));
        }
      );
      
      req.on('error', (err) => {
        // If server is not up yet, log to console
        console.error('\x1b[31m[Antigravity Hook] Failed to report bypass to MCP server:\x1b[0m', err.message);
        resolve(false);
      });

      req.write(dataStr);
      req.end();
    });
  }
}

export const antigravityHook = new AntigravityHook();
export default antigravityHook;
