import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { redmineClient } from '../client/index.js';
import { formatIssue, formatList, truncateText } from '../utils/formatters.js';
import { handleAxiosError, formatErrorResponse } from '../utils/errors.js';
import { 
  validateInput, 
  parseId,
  createIssueSchema,
  updateIssueSchema,
  issueQuerySchema 
} from '../utils/validators.js';

// List issues tool
export const listIssuesTool: Tool = {
  name: 'redmine_list_issues',
  description: 'List issues from Redmine with optional filters',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { 
        type: 'string', 
        description: 'Project ID or identifier' 
      },
      status_id: { 
        type: 'string', 
        description: 'Status ID or "open"/"closed"/"*"' 
      },
      assigned_to_id: { 
        type: 'string', 
        description: 'User ID, "me", or group ID' 
      },
      tracker_id: { 
        type: 'number', 
        description: 'Tracker ID' 
      },
      subject: { 
        type: 'string', 
        description: 'Filter by subject (partial match)' 
      },
      created_on: { 
        type: 'string', 
        description: 'Created date filter (e.g., "><2024-01-01|2024-12-31")' 
      },
      updated_on: { 
        type: 'string', 
        description: 'Updated date filter' 
      },
      sort: { 
        type: 'string', 
        description: 'Sort order (e.g., "priority:desc,updated_on:desc")' 
      },
      limit: { 
        type: 'number', 
        description: 'Maximum number of issues to return (1-100, default: 25)' 
      },
      offset: { 
        type: 'number', 
        description: 'Number of issues to skip' 
      }
    }
  }
};

export async function listIssues(input: unknown) {
  try {
    const params = validateInput(issueQuerySchema, input);
    const response = await redmineClient.listIssues(params);
    
    const issues: any[] = Array.isArray(response.issues) ? response.issues : [];
    const total = response.total_count || issues.length;
    
    let content = `Found ${total} issue(s)`;
    if (params.offset && params.offset > 0) {
      content += ` (showing ${params.offset + 1}-${params.offset + issues.length})`;
    }
    content += '\n\n';
    
    if (issues.length > 0) {
      content += formatList(issues, (issue) => {
        const formatted = formatIssue(issue);
        // Truncate description for list view
        return formatted.replace(/\nDescription:\n.*/s, (match) => {
          const desc = match.replace(/\nDescription:\n/, '');
          return desc.length > 200 ? `\nDescription:\n${truncateText(desc, 200)}` : match;
        });
      });
    } else {
      content += 'No issues found matching the criteria.';
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

// Get issue tool
export const getIssueTool: Tool = {
  name: 'redmine_get_issue',
  description: 'Get detailed information about a specific issue',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'Issue ID' 
      },
      include: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional data to include: journals, watchers, relations, children, attachments, changesets'
      }
    },
    required: ['id']
  }
};

export async function getIssue(input: unknown) {
  try {
    let { id, include } = input as { id: number; include?: string[] };
    const issueId = parseId(id);

    // journals가 포함되어 있지 않으면 추가
    if (!include) {
      include = ['journals'];
    } else if (!include.includes('journals')) {
      include = [...include, 'journals'];
    }

    const response = await redmineClient.getIssue(issueId, include);
    const content = formatIssue(response.issue);
    
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

// Create issue tool
export const createIssueTool: Tool = {
  name: 'redmine_create_issue',
  description: 'Create a new issue in Redmine',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { 
        type: 'number', 
        description: 'Project ID' 
      },
      subject: { 
        type: 'string', 
        description: 'Issue subject/title' 
      },
      description: { 
        type: 'string', 
        description: 'Issue description' 
      },
      tracker_id: { 
        type: 'number', 
        description: 'Tracker ID (e.g., Bug, Feature, Task)' 
      },
      status_id: { 
        type: 'number', 
        description: 'Status ID' 
      },
      priority_id: { 
        type: 'number', 
        description: 'Priority ID' 
      },
      assigned_to_id: { 
        type: 'number', 
        description: 'Assigned user ID' 
      },
      category_id: { 
        type: 'number', 
        description: 'Category ID' 
      },
      fixed_version_id: { 
        type: 'number', 
        description: 'Target version ID' 
      },
      parent_issue_id: { 
        type: 'number', 
        description: 'Parent issue ID' 
      },
      start_date: { 
        type: 'string', 
        description: 'Start date (YYYY-MM-DD)' 
      },
      due_date: { 
        type: 'string', 
        description: 'Due date (YYYY-MM-DD)' 
      },
      estimated_hours: { 
        type: 'number', 
        description: 'Estimated hours' 
      },
      done_ratio: { 
        type: 'number', 
        description: 'Completion percentage (0-100)' 
      },
      is_private: { 
        type: 'boolean', 
        description: 'Whether the issue is private' 
      },
      watcher_user_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'User IDs to add as watchers'
      },
      custom_field_values: {
        type: 'object',
        description: 'Custom field values as key-value pairs'
      }
    },
    required: ['project_id', 'subject']
  }
};

export async function createIssue(input: unknown) {
  try {
    const issueData = validateInput(createIssueSchema, input);
    
    // Transform the data to match Redmine API format
    const apiData: any = {
      project_id: issueData.project_id,
      subject: issueData.subject,
      description: issueData.description,
      tracker_id: issueData.tracker_id,
      status_id: issueData.status_id,
      priority_id: issueData.priority_id,
      assigned_to_id: issueData.assigned_to_id,
      category_id: issueData.category_id,
      fixed_version_id: issueData.fixed_version_id,
      parent_issue_id: issueData.parent_issue_id,
      start_date: issueData.start_date,
      due_date: issueData.due_date,
      estimated_hours: issueData.estimated_hours,
      done_ratio: issueData.done_ratio,
      is_private: issueData.is_private,
      watcher_user_ids: issueData.watcher_user_ids,
      custom_field_values: issueData.custom_field_values,
    };
    
    const response = await redmineClient.createIssue(apiData);
    const content = `Issue created successfully!\n\n${formatIssue(response.issue)}`;
    
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

// Update issue tool
export const updateIssueTool: Tool = {
  name: 'redmine_update_issue',
  description: 'Update an existing issue in Redmine',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'Issue ID to update' 
      },
      subject: { 
        type: 'string', 
        description: 'Issue subject/title' 
      },
      description: { 
        type: 'string', 
        description: 'Issue description' 
      },
      notes: { 
        type: 'string', 
        description: 'Update notes/comment' 
      },
      private_notes: { 
        type: 'boolean', 
        description: 'Whether the notes are private' 
      },
      tracker_id: { 
        type: 'number', 
        description: 'Tracker ID' 
      },
      status_id: { 
        type: 'number', 
        description: 'Status ID' 
      },
      priority_id: { 
        type: 'number', 
        description: 'Priority ID' 
      },
      assigned_to_id: { 
        type: 'number', 
        description: 'Assigned user ID' 
      },
      category_id: { 
        type: 'number', 
        description: 'Category ID' 
      },
      fixed_version_id: { 
        type: 'number', 
        description: 'Target version ID' 
      },
      parent_issue_id: { 
        type: 'number', 
        description: 'Parent issue ID' 
      },
      start_date: { 
        type: 'string', 
        description: 'Start date (YYYY-MM-DD)' 
      },
      due_date: { 
        type: 'string', 
        description: 'Due date (YYYY-MM-DD)' 
      },
      estimated_hours: { 
        type: 'number', 
        description: 'Estimated hours' 
      },
      done_ratio: { 
        type: 'number', 
        description: 'Completion percentage (0-100)' 
      },
      is_private: { 
        type: 'boolean', 
        description: 'Whether the issue is private' 
      },
      custom_field_values: {
        type: 'object',
        description: 'Custom field values as key-value pairs'
      }
    },
    required: ['id']
  }
};

export async function updateIssue(input: unknown) {
  try {
    const { id, ...updateData } = input as any;
    const issueId = parseId(id);
    const validatedData = validateInput(updateIssueSchema, updateData);
    
    await redmineClient.updateIssue(issueId, validatedData as any);
    
    // Fetch updated issue to show current state
    const response = await redmineClient.getIssue(issueId);
    const content = `Issue updated successfully!\n\n${formatIssue(response.issue)}`;
    
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

// Delete issue tool
export const deleteIssueTool: Tool = {
  name: 'redmine_delete_issue',
  description: 'Delete an issue from Redmine',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'Issue ID to delete' 
      }
    },
    required: ['id']
  }
};

export async function deleteIssue(input: unknown) {
  try {
    const { id } = input as { id: number };
    const issueId = parseId(id);
    
    await redmineClient.deleteIssue(issueId);
    
    return {
      content: [{ type: 'text', text: `Issue #${issueId} deleted successfully.` }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true
    };
  }
}