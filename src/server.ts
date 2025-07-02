import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { tools, toolHandlers } from './tools/index.js';

const SERVER_NAME = 'mcp-server-redmine';
const SERVER_VERSION = '1.0.0';

export async function createRedmineServer(): Promise<Server> {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Register call tool handler with enhanced error handling
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const timestamp = new Date().toISOString();
    const logLevel = process.env.LOG_LEVEL || 'info';
    
    // Log tool calls in debug mode
    if (logLevel === 'debug') {
      console.error(`[${timestamp}] [DEBUG] Tool call: ${name} with args:`, JSON.stringify(args, null, 2));
    }
    
    const handler = toolHandlers[name];
    if (!handler) {
      const errorMsg = `Unknown tool: ${name}`;
      console.error(`[${timestamp}] [ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    const startTime = Date.now();
    
    try {
      const result = await handler(args);
      
      const duration = Date.now() - startTime;
      if (logLevel === 'debug') {
        console.error(`[${timestamp}] [DEBUG] Tool ${name} completed in ${duration}ms`);
      }
      
      // Validate result structure
      if (!result || !result.content || !Array.isArray(result.content)) {
        throw new Error(`Tool ${name} returned invalid result structure`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[${timestamp}] [ERROR] Tool ${name} failed after ${duration}ms: ${errorMsg}`);
      
      // Enhanced error logging in debug mode
      if (logLevel === 'debug' && error instanceof Error) {
        console.error(`[${timestamp}] [DEBUG] Stack trace:`, error.stack);
      }
      
      // Return standardized error response
      return {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const timestamp = new Date().toISOString();
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  console.error(`[${timestamp}] [INFO] Starting ${SERVER_NAME} v${SERVER_VERSION}...`);
  console.error(`[${timestamp}] [INFO] Connecting to Redmine at: ${config.redmine.url}`);
  
  // Connection timeout for DXT environment
  const connectionTimeout = 15000; // 15 seconds
  
  try {
    const transport = new StdioServerTransport();
    const server = await createRedmineServer();
    
    // Set up connection with timeout
    const connectionPromise = server.connect(transport);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), connectionTimeout);
    });
    
    await Promise.race([connectionPromise, timeoutPromise]);
    
    console.error(`[${timestamp}] [INFO] ${SERVER_NAME} is running and ready for requests`);
    
    if (logLevel === 'debug') {
      console.error(`[${timestamp}] [DEBUG] Available tools: ${Object.keys(toolHandlers).length}`);
      console.error(`[${timestamp}] [DEBUG] Tool names: ${Object.keys(toolHandlers).join(', ')}`);
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown connection error';
    console.error(`[${timestamp}] [ERROR] Failed to start server: ${errorMsg}`);
    throw error;
  }
}