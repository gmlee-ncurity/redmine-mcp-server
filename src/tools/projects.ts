import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { redmineClient } from '../client/index.js';
import { formatProject, formatList } from '../utils/formatters.js';
import { formatErrorResponse } from '../utils/errors.js';
import { validateInput, parseId, paginationSchema } from '../utils/validators.js';

// List projects tool
export const listProjectsTool: Tool = {
  name: 'redmine_list_projects',
  description: 'List all available Redmine projects',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { 
        type: 'number', 
        description: 'Maximum number of projects to return (1-100, default: 25)' 
      },
      offset: { 
        type: 'number', 
        description: 'Number of projects to skip' 
      }
    }
  }
};

export async function listProjects(input: unknown) {
  try {
    const params = validateInput(paginationSchema, input || {});
    const response = await redmineClient.listProjects(params);
    
    const projects: any[] = Array.isArray(response.projects) ? response.projects : [];
    const total = response.total_count || projects.length;
    
    let content = `Found ${total} project(s)`;
    if (params.offset && params.offset > 0) {
      content += ` (showing ${params.offset + 1}-${params.offset + projects.length})`;
    }
    content += '\n\n';
    
    if (projects.length > 0) {
      content += formatList(projects, formatProject);
    } else {
      content += 'No projects found.';
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

// Get project tool
export const getProjectTool: Tool = {
  name: 'redmine_get_project',
  description: 'Get detailed information about a specific project',
  inputSchema: {
    type: 'object',
    properties: {
      id: { 
        type: 'string', 
        description: 'Project ID or identifier' 
      },
      include: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional data to include: trackers, issue_categories, enabled_modules, time_entry_activities'
      }
    },
    required: ['id']
  }
};

export async function getProject(input: unknown) {
  try {
    const { id, include } = input as { id: string; include?: string[] };
    
    const response = await redmineClient.getProject(id, include);
    let content = formatProject(response.project);
    
    // Add additional included information
    if (include?.includes('trackers') && response.project.trackers) {
      content += '\n\nTrackers:';
      response.project.trackers.forEach(tracker => {
        content += `\n  - ${tracker.name} (ID: ${tracker.id})`;
      });
    }
    
    if (include?.includes('issue_categories') && response.project.issue_categories) {
      content += '\n\nIssue Categories:';
      response.project.issue_categories.forEach(category => {
        content += `\n  - ${category.name} (ID: ${category.id})`;
        if (category.assigned_to) {
          content += ` - Assigned to: ${category.assigned_to.name}`;
        }
      });
    }
    
    if (include?.includes('enabled_modules') && response.project.enabled_modules) {
      content += '\n\nEnabled Modules:';
      response.project.enabled_modules.forEach(module => {
        content += `\n  - ${module.name}`;
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

// Get project versions tool
export const getProjectVersionsTool: Tool = {
  name: 'redmine_get_project_versions',
  description: 'Get versions/milestones for a specific project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { 
        type: 'string', 
        description: 'Project ID or identifier' 
      }
    },
    required: ['project_id']
  }
};

export async function getProjectVersions(input: unknown) {
  try {
    const { project_id } = input as { project_id: string };
    
    const response = await redmineClient.listVersions(project_id);
    const versions = response.versions || [];
    
    let content = `Found ${versions.length} version(s) for project\n\n`;
    
    if (versions.length > 0) {
      versions.forEach(version => {
        content += `Version: ${version.name} (ID: ${version.id})\n`;
        content += `  Status: ${version.status}\n`;
        if (version.due_date) {
          content += `  Due date: ${version.due_date}\n`;
        }
        if (version.description) {
          content += `  Description: ${version.description}\n`;
        }
        content += '\n';
      });
    } else {
      content += 'No versions found for this project.';
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