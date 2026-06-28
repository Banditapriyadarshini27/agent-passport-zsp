import http from 'http';
import { antigravityHook } from '../antigravity/hook.js';

// The Mock Tool Runner which executes tools
class ToolRunner {
  // Direct execution channel - what an agent might try to call directly to bypass the system
  async executeDirectly(toolName, args, bypassToken = null) {
    // If the hook is active, this method is monkey-patched and will throw an error
    console.log(`[ToolRunner] Executing direct system-level access for tool '${toolName}' with arguments:`, args);
    return `[Mock System Tool Output] Directly executed ${toolName}`;
  }

  // The official, secure pathway: check out a token and route through the MCP Server Gateway
  async executeSecurely(toolName, args) {
    const agentId = 'requestor-agent-01';
    
    console.log(`\n\x1b[35m[Requestor Agent] Starting Secure Execution for tool: '${toolName}'\x1b[0m`);
    
    // Step 1: Checkout Ephemeral Token
    let checkoutResponse;
    try {
      checkoutResponse = await this.postJson('http://127.0.0.1:4000/mcp/checkout', {
        agentId,
        toolName,
        args
      });
    } catch (err) {
      console.error(`\x1b[31m[Requestor Agent] Checkout failed:\x1b[0m`, err.message);
      return;
    }

    if (checkoutResponse.error) {
      console.error(`\x1b[31m[Requestor Agent] Gateway denied checkout:\x1b[0m ${checkoutResponse.error} - ${checkoutResponse.reason || ''}`);
      return;
    }

    const { token, expiresAt, requiresMfa } = checkoutResponse;
    console.log(`\x1b[32m[Requestor Agent] Ephemeral Passport Token acquired:\x1b[0m ${token} (expires in 8s)`);
    if (requiresMfa) {
      console.log(`\x1b[33m[Requestor Agent] Elevated confirmation required for tool '${toolName}'...\x1b[0m`);
    }

    // Step 2: Execute Tool call via MCP Gateway
    try {
      const executeResponse = await this.postJson('http://127.0.0.1:4000/mcp/execute', {
        agentId,
        toolName,
        token,
        args
      });

      if (executeResponse.error) {
        console.error(`\x1b[31m[Requestor Agent] Gateway execution blocked:\x1b[0m ${executeResponse.error} - ${executeResponse.reason || ''}`);
      } else {
        console.log(`\x1b[32m[Requestor Agent] Tool execution succeeded!\x1b[0m\nResult:`, executeResponse.result);
      }
    } catch (err) {
      console.error(`\x1b[31m[Requestor Agent] Gateway execution failed:\x1b[0m`, err.message);
    }
  }

  // Helper method for REST calls
  postJson(url, data) {
    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify(data);
      const u = new URL(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': dataStr.length
          }
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ error: 'JSON Parse Error', raw: body });
            }
          });
        }
      );
      
      req.on('error', reject);
      req.write(dataStr);
      req.end();
    });
  }
}

// Instantiate tool runner
const runner = new ToolRunner();

// LOCK DOWN the execution context using our Antigravity Security Hook
antigravityHook.lockdown(runner);

// Function to run a sequence of simulated actions
async function runSimulations() {
  const action = process.argv[2] || 'all';

  console.log(`\x1b[1m[Requestor Agent Agent-Passport Demo Client]\x1b[0m`);
  console.log(`Simulating action mode: "${action}"\n`);

  if (action === 'all' || action === 'authorized') {
    // SCENARIO 1: Authorized and fully secure read operation
    await runner.executeSecurely('read_file', {
      AbsolutePath: 'c:/Users/bandi/OneDrive/capstone/data.json'
    });
  }

  if (action === 'all' || action === 'bypass') {
    // SCENARIO 2: Gateway bypass attempt (Direct tool access)
    console.log('\n\x1b[35m[Requestor Agent] Attempting direct system execution of read_file (Bypassing Gateway)...\x1b[0m');
    try {
      // The agent tries to call executeDirectly without a token
      await runner.executeDirectly('read_file', { AbsolutePath: 'c:/Users/bandi/OneDrive/capstone/data.json' });
    } catch (err) {
      console.error(`\x1b[31m[Requestor Agent] Attempt blocked at runtime:\x1b[0m ${err.message}`);
    }
  }

  if (action === 'all' || action === 'anomaly') {
    // SCENARIO 3: Threat anomaly injection attempt (Command injection in args)
    await runner.executeSecurely('write_to_file', {
      TargetFile: 'c:/Users/bandi/OneDrive/capstone/app.js',
      CodeContent: 'console.log("hello"); rm -rf /' // malicious injection
    });
  }

  if (action === 'all' || action === 'governance') {
    // SCENARIO 4: Governance refusal (Path traversal)
    await runner.executeSecurely('read_file', {
      AbsolutePath: 'C:/Windows/System32/cmd.exe' // unauthorized target path
    });
  }
}

// Run the script
runSimulations();
