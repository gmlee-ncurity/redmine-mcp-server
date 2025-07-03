import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { redmineClient } from '../client/index.js';
import { formatTimeEntry, formatList } from '../utils/formatters.js';
import { formatErrorResponse } from '../utils/errors.js';
import { 
  validateInput, 
  parseId,
  createTimeEntrySchema,
  updateTimeEntrySchema,
  timeEntryQuerySchema 
} from '../utils/validators.js';
import type { TimeEntry } from '../client/types.js';

// List time entries tool
export const listTimeEntriesTool: Tool = {
  name: 'redmine_list_time_entries',
  description: 'List time entries with optional filters',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { 
        type: 'string', 
        description: 'Project ID or identifier' 
      },
      issue_id: { 
        type: 'number', 
        description: 'Issue ID' 
      },
      user_id: { 
        type: 'string', 
        description: 'User ID or "me"' 
      },
      spent_on: { 
        type: 'string', 
        description: 'Specific date (YYYY-MM-DD)' 
      },
      from: { 
        type: 'string', 
        description: 'Start date for range (YYYY-MM-DD)' 
      },
      to: { 
        type: 'string', 
        description: 'End date for range (YYYY-MM-DD)' 
      },
      activity_id: { 
        type: 'number', 
        description: 'Time entry activity ID' 
      },
      limit: { 
        type: 'number', 
        description: 'Maximum number of entries to return (1-100, default: 25)' 
      },
      offset: { 
        type: 'number', 
        description: 'Number of entries to skip' 
      }
    }
  }
};

export async function listTimeEntries(input: unknown) {
  try {
    const params = validateInput(timeEntryQuerySchema, input || {});
    const response = await redmineClient.listTimeEntries(params);
    
    const entries: TimeEntry[] = Array.isArray(response.time_entries) ? response.time_entries : [];
    const total = response.total_count || entries.length;
    
    let content = `Found ${total} time entry(ies)`;
    if (params.offset && params.offset > 0) {
      content += ` (showing ${params.offset + 1}-${params.offset + entries.length})`;
    }
    
    // Calculate total hours
    const totalHours = entries.reduce((sum: number, entry: TimeEntry) => sum + entry.hours, 0);
    content += `\nTotal hours: ${totalHours.toFixed(2)}\n\n`;
    
    if (entries.length > 0) {
      content += formatList(entries, formatTimeEntry);
    } else {
      content += 'No time entries found matching the criteria.';
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

// Get time entry tool
export const getTimeEntryTool: Tool = {
  name: 'redmine_get_time_entry',
  description: 'Get detailed information about a specific time entry',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'Time entry ID' 
      }
    },
    required: ['id']
  }
};

export async function getTimeEntry(input: unknown) {
  try {
    const { id } = input as { id: number };
    const entryId = parseId(id);
    
    const response = await redmineClient.getTimeEntry(entryId);
    const content = formatTimeEntry(response.time_entry);
    
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

// Create time entry tool
export const createTimeEntryTool: Tool = {
  name: 'redmine_create_time_entry',
  description: 'Create a new time entry',
  inputSchema: {
    type: 'object',
    properties: {
      issue_id: { 
        type: 'number', 
        description: 'Issue ID (either issue_id or project_id is required)' 
      },
      project_id: { 
        type: 'number', 
        description: 'Project ID (either issue_id or project_id is required)' 
      },
      hours: { 
        type: 'number', 
        description: 'Time spent in hours' 
      },
      activity_id: { 
        type: 'number', 
        description: 'Activity ID' 
      },
      spent_on: { 
        type: 'string', 
        description: 'Date when time was spent (YYYY-MM-DD, defaults to today)' 
      },
      comments: { 
        type: 'string', 
        description: 'Description of work done' 
      },
      user_id: { 
        type: 'number', 
        description: 'User ID (admin only, defaults to current user)' 
      },
      custom_field_values: {
        type: 'object',
        description: 'Custom field values as key-value pairs'
      }
    },
    required: ['hours', 'activity_id']
  }
};

export async function createTimeEntry(input: unknown) {
  try {
    const entryData = validateInput(createTimeEntrySchema, input);
    
    const response = await redmineClient.createTimeEntry(entryData as Partial<TimeEntry>);
    const content = `Time entry created successfully!\n\n${formatTimeEntry(response.time_entry)}`;
    
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

// Update time entry tool
export const updateTimeEntryTool: Tool = {
  name: 'redmine_update_time_entry',
  description: 'Update an existing time entry',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'Time entry ID to update' 
      },
      issue_id: { 
        type: 'number', 
        description: 'Issue ID' 
      },
      project_id: { 
        type: 'number', 
        description: 'Project ID' 
      },
      hours: { 
        type: 'number', 
        description: 'Time spent in hours' 
      },
      activity_id: { 
        type: 'number', 
        description: 'Activity ID' 
      },
      spent_on: { 
        type: 'string', 
        description: 'Date when time was spent (YYYY-MM-DD)' 
      },
      comments: { 
        type: 'string', 
        description: 'Description of work done' 
      },
      custom_field_values: {
        type: 'object',
        description: 'Custom field values as key-value pairs'
      }
    },
    required: ['id']
  }
};

export async function updateTimeEntry(input: unknown) {
  try {
    const { id, ...updateData } = input as { id: number; [key: string]: unknown };
    const entryId = parseId(id);
    const validatedData = validateInput(updateTimeEntrySchema, updateData);
    
    await redmineClient.updateTimeEntry(entryId, validatedData as Partial<TimeEntry>);
    
    // Fetch updated entry to show current state
    const response = await redmineClient.getTimeEntry(entryId);
    const content = `Time entry updated successfully!\n\n${formatTimeEntry(response.time_entry)}`;
    
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

// Delete time entry tool
export const deleteTimeEntryTool: Tool = {
  name: 'redmine_delete_time_entry',
  description: 'Delete a time entry',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'number', 
        description: 'Time entry ID to delete' 
      }
    },
    required: ['id']
  }
};

export async function deleteTimeEntry(input: unknown) {
  try {
    const { id } = input as { id: number };
    const entryId = parseId(id);
    
    await redmineClient.deleteTimeEntry(entryId);
    
    return {
      content: [{ type: 'text', text: `Time entry #${entryId} deleted successfully.` }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true
    };
  }
}

// List time entry activities tool
export const listTimeEntryActivitiesTool: Tool = {
  name: 'redmine_list_time_entry_activities',
  description: 'List available time entry activities',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function listTimeEntryActivities() {
  try {
    const response = await redmineClient.listTimeEntryActivities();
    const activities = response.time_entry_activities || [];
    
    let content = `Available Time Entry Activities:\n\n`;
    
    if (activities.length > 0) {
      activities.forEach(activity => {
        content += `- ${activity.name} (ID: ${activity.id})`;
        if (activity.is_default) {
          content += ' [DEFAULT]';
        }
        if (activity.active === false) {
          content += ' [INACTIVE]';
        }
        content += '\n';
      });
    } else {
      content += 'No time entry activities found.';
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