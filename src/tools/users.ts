import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { redmineClient } from '../client/index.js';
import { formatUser, formatList } from '../utils/formatters.js';
import { formatErrorResponse } from '../utils/errors.js';
import { validateInput, parseId, paginationSchema } from '../utils/validators.js';
import type { RedmineUser } from '../client/types.js';

// List users tool
export const listUsersTool: Tool = {
  name: 'redmine_list_users',
  description: 'List users in Redmine',
  inputSchema: {
    type: 'object',
    properties: {
      name: { 
        type: 'string', 
        description: 'Filter by name (first name, last name, or login)' 
      },
      group_id: { 
        type: 'number', 
        description: 'Filter by group ID' 
      },
      limit: { 
        type: 'number', 
        description: 'Maximum number of users to return (1-100, default: 25)' 
      },
      offset: { 
        type: 'number', 
        description: 'Number of users to skip' 
      }
    }
  }
};

const listUsersSchema = paginationSchema.extend({
  name: z.string().optional(),
  group_id: z.number().int().positive().optional(),
});

export async function listUsers(input: unknown) {
  try {
    const params = validateInput(listUsersSchema, input || {});
    const response = await redmineClient.listUsers(params);
    
    const users: RedmineUser[] = Array.isArray(response.users) ? response.users : [];
    const total = response.total_count || users.length;
    
    let content = `Found ${total} user(s)`;
    if (params.name) {
      content += ` matching "${params.name}"`;
    }
    if (params.offset && params.offset > 0) {
      content += ` (showing ${params.offset + 1}-${params.offset + users.length})`;
    }
    content += '\n\n';
    
    if (users.length > 0) {
      content += formatList(users, formatUser);
    } else {
      content += 'No users found matching the criteria.';
    }
    
    return {
      content: [{ type: 'text', text: content }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true
    };
  }
}

// Get current user tool
export const getCurrentUserTool: Tool = {
  name: 'redmine_get_current_user',
  description: 'Get information about the currently authenticated user',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function getCurrentUser() {
  try {
    const response = await redmineClient.getCurrentUser();
    const content = `Current User:\n\n${formatUser(response.user)}`;
    
    return {
      content: [{ type: 'text', text: content }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true
    };
  }
}

// Get user tool
export const getUserTool: Tool = {
  name: 'redmine_get_user',
  description: 'Get detailed information about a specific user',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'User ID' 
      },
      include: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional data to include: memberships, groups'
      }
    },
    required: ['id']
  }
};

export async function getUser(input: unknown) {
  try {
    const { id, include } = input as { id: number; include?: string[] };
    const userId = parseId(id);
    
    const response = await redmineClient.getUser(userId, include);
    let content = formatUser(response.user);
    
    // Add additional included information
    if (include?.includes('memberships') && 'memberships' in response.user && response.user.memberships) {
      content += '\n\nMemberships:';
      (response.user as RedmineUser & { memberships: Array<{ project: { name: string }; roles?: Array<{ name: string }> }> }).memberships.forEach((membership) => {
        content += `\n  - ${membership.project.name}`;
        if (membership.roles) {
          const roles = membership.roles.map((r) => r.name).join(', ');
          content += ` (${roles})`;
        }
      });
    }
    
    if (include?.includes('groups') && 'groups' in response.user && response.user.groups) {
      content += '\n\nGroups:';
      (response.user as RedmineUser & { groups: Array<{ id: number; name: string }> }).groups.forEach((group) => {
        content += `\n  - ${group.name} (ID: ${group.id})`;
      });
    }
    
    return {
      content: [{ type: 'text', text: content }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true
    };
  }
}