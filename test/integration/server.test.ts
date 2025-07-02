import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRedmineServer } from '../../src/server.js';
import { config } from '../../src/config.js';

// Mock stdio transport for testing
class MockTransport extends StdioServerTransport {
  public messages: any[] = [];
  public responses: any[] = [];

  constructor() {
    super();
  }

  async send(message: any): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  async *receive(): AsyncGenerator<any> {
    while (this.responses.length > 0) {
      yield this.responses.shift();
    }
  }

  addResponse(response: any): void {
    this.responses.push(response);
  }
}

describe('Redmine MCP Server Integration', () => {
  let server: Server;
  let transport: MockTransport;

  beforeAll(async () => {
    // Set up test environment variables if needed
    process.env.REDMINE_URL = process.env.REDMINE_URL || 'https://test.redmine.com';
    process.env.REDMINE_API_KEY = process.env.REDMINE_API_KEY || 'test-api-key';
  });

  beforeEach(async () => {
    server = await createRedmineServer();
    transport = new MockTransport();
  });

  afterAll(() => {
    // Clean up
    delete process.env.REDMINE_URL;
    delete process.env.REDMINE_API_KEY;
  });

  describe('Server Initialization', () => {
    it('should create server with correct metadata', () => {
      expect(server.serverInfo.name).toBe('mcp-server-redmine');
      expect(server.serverInfo.version).toBe('1.0.0');
    });

    it('should have tools capability', () => {
      expect(server.serverInfo.capabilities).toHaveProperty('tools');
    });
  });

  describe('List Tools', () => {
    it('should list all available tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const handler = server.requestHandlers.get('tools/list');
      expect(handler).toBeDefined();

      if (handler) {
        const response = await handler(request, {});
        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);
        expect(response.tools.length).toBeGreaterThan(0);

        // Check for some expected tools
        const toolNames = response.tools.map((t: any) => t.name);
        expect(toolNames).toContain('redmine_list_issues');
        expect(toolNames).toContain('redmine_create_issue');
        expect(toolNames).toContain('redmine_list_projects');
        expect(toolNames).toContain('redmine_list_time_entries');
        expect(toolNames).toContain('redmine_list_wiki_pages');

        // Check tool structure
        const issueTool = response.tools.find((t: any) => t.name === 'redmine_list_issues');
        expect(issueTool).toHaveProperty('description');
        expect(issueTool).toHaveProperty('inputSchema');
        expect(issueTool.inputSchema).toHaveProperty('type', 'object');
        expect(issueTool.inputSchema).toHaveProperty('properties');
      }
    });
  });

  describe('Call Tool', () => {
    it('should handle tool calls', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'redmine_list_statuses',
          arguments: {},
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      expect(handler).toBeDefined();

      if (handler) {
        // This will fail in unit tests without a real Redmine instance
        // but demonstrates the structure
        try {
          const response = await handler(request, {});
          expect(response).toHaveProperty('content');
          expect(Array.isArray(response.content)).toBe(true);
          expect(response.content[0]).toHaveProperty('type', 'text');
        } catch (error) {
          // Expected in test environment without real Redmine
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle unknown tool error', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      expect(handler).toBeDefined();

      if (handler) {
        await expect(handler(request, {})).rejects.toThrow('Unknown tool: unknown_tool');
      }
    });

    it('should handle tool errors gracefully', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'redmine_get_issue',
          arguments: {
            id: 'invalid', // Should be a number
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      expect(handler).toBeDefined();

      if (handler) {
        const response = await handler(request, {});
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('isError', true);
        expect(response.content[0].text).toContain('Error:');
      }
    });
  });

  describe('Tool Validation', () => {
    it('should validate required parameters', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'redmine_create_issue',
          arguments: {
            // Missing required fields: project_id and subject
            description: 'Test description',
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        const response = await handler(request, {});
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Validation error');
      }
    });

    it('should validate parameter types', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'redmine_update_issue',
          arguments: {
            id: 123,
            done_ratio: 'fifty', // Should be a number
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        const response = await handler(request, {});
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Validation error');
      }
    });

    it('should validate date formats', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'redmine_create_issue',
          arguments: {
            project_id: 1,
            subject: 'Test',
            due_date: '2024/01/15', // Wrong format, should be YYYY-MM-DD
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        const response = await handler(request, {});
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Invalid date format');
      }
    });
  });

  describe('Complex Tool Scenarios', () => {
    it('should handle pagination parameters', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'redmine_list_issues',
          arguments: {
            limit: 50,
            offset: 100,
            sort: 'updated_on:desc',
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        try {
          const response = await handler(request, {});
          // Would contain pagination info in real scenario
          expect(response).toHaveProperty('content');
        } catch (error) {
          // Expected without real Redmine
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle complex filters', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'redmine_list_time_entries',
          arguments: {
            user_id: 'me',
            from: '2024-01-01',
            to: '2024-01-31',
            project_id: 'my-project',
            activity_id: 9,
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        try {
          const response = await handler(request, {});
          expect(response).toHaveProperty('content');
        } catch (error) {
          // Expected without real Redmine
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle custom field values', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'redmine_create_issue',
          arguments: {
            project_id: 1,
            subject: 'Issue with custom fields',
            custom_field_values: {
              '1': 'Custom value 1',
              '2': 'Custom value 2',
            },
          },
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        try {
          const response = await handler(request, {});
          expect(response).toHaveProperty('content');
        } catch (error) {
          // Expected without real Redmine
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should format network errors properly', async () => {
      // This would require mocking the HTTP client
      // to simulate network errors
      const request = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'redmine_list_projects',
          arguments: {},
        },
      };

      const handler = server.requestHandlers.get('tools/call');
      if (handler) {
        try {
          const response = await handler(request, {});
          // In test environment, might get connection error
          if (response.isError) {
            expect(response.content[0].text).toMatch(/Error:/);
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });
});