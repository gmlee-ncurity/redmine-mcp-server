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

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    
    try {
      const result = await handler(args);
      return result;
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      
      // Return error in standard format
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  console.error(`Starting ${SERVER_NAME} v${SERVER_VERSION}...`);
  console.error(`Connecting to Redmine at: ${config.redmine.url}`);
  
  const transport = new StdioServerTransport();
  const server = await createRedmineServer();
  
  await server.connect(transport);
  console.error('Redmine MCP server is running');
}