import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { 
  listIssues, 
  getIssue, 
  createIssue, 
  updateIssue,
  deleteIssue 
} from '../../src/tools/issues.js';
import { 
  listProjects, 
  getProject,
  getProjectVersions 
} from '../../src/tools/projects.js';
import { 
  listUsers, 
  getCurrentUser,
  getUser 
} from '../../src/tools/users.js';
import { 
  listTimeEntries,
  createTimeEntry,
  listTimeEntryActivities 
} from '../../src/tools/time-entries.js';
import { 
  listWikiPages,
  getWikiPage,
  createOrUpdateWikiPage,
  deleteWikiPage 
} from '../../src/tools/wiki.js';
import { updateJournal } from '../../src/tools/journals.js';
import {
  getAttachment,
  updateAttachment,
  deleteAttachment,
  downloadAttachment,
} from '../../src/tools/attachments.js';
import {
  listFiles,
  createFile,
  uploadFile,
} from '../../src/tools/files.js';
import { customRequest, tools, toolHandlers } from '../../src/tools/index.js';
import { redmineClient } from '../../src/client/index.js';
import { config } from '../../src/config.js';

// Mock the client
vi.mock('../../src/client/index.js', () => ({
  redmineClient: {
    listIssues: vi.fn(),
    getIssue: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listVersions: vi.fn(),
    listUsers: vi.fn(),
    getCurrentUser: vi.fn(),
    getUser: vi.fn(),
    listTimeEntries: vi.fn(),
    getTimeEntry: vi.fn(),
    createTimeEntry: vi.fn(),
    updateTimeEntry: vi.fn(),
    deleteTimeEntry: vi.fn(),
    listTimeEntryActivities: vi.fn(),
    listWikiPages: vi.fn(),
    getWikiPage: vi.fn(),
    createOrUpdateWikiPage: vi.fn(),
    deleteWikiPage: vi.fn(),
    listIssueStatuses: vi.fn(),
    listIssuePriorities: vi.fn(),
    listTrackers: vi.fn(),
    customRequest: vi.fn(),
    updateJournal: vi.fn(),
    getAttachment: vi.fn(),
    updateAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    downloadAttachment: vi.fn(),
    listFiles: vi.fn(),
    createFile: vi.fn(),
    uploadFile: vi.fn(),
  },
}));

describe('Issue Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listIssues', () => {
    it('should list issues with formatting', async () => {
      const mockIssues = {
        issues: [
          {
            id: 1,
            subject: 'Test Issue',
            project: { name: 'Test Project' },
            status: { name: 'New' },
            priority: { name: 'Normal' },
            author: { name: 'John Doe' },
            done_ratio: 0,
          },
        ],
        total_count: 1,
      };

      vi.mocked(redmineClient.listIssues).mockResolvedValue(mockIssues);

      const result = await listIssues({ project_id: 'test', limit: 25 });

      expect(redmineClient.listIssues).toHaveBeenCalledWith({
        project_id: 'test',
        limit: 25,
      });
      expect(result.content[0].text).toContain('Found 1 issue(s)');
      expect(result.content[0].text).toContain('#1 - Test Issue');
      expect(result.content[0].text).toContain('Project: Test Project');
    });

    it('should handle empty results', async () => {
      vi.mocked(redmineClient.listIssues).mockResolvedValue({
        issues: [],
        total_count: 0,
      });

      const result = await listIssues({});

      expect(result.content[0].text).toContain('No issues found');
    });

    it('should handle errors', async () => {
      vi.mocked(redmineClient.listIssues).mockRejectedValue(
        new Error('API Error')
      );

      const result = await listIssues({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: API Error');
    });
  });

  describe('getIssue', () => {
    it('should get issue details', async () => {
      const mockIssue = {
        issue: {
          id: 123,
          subject: 'Detailed Issue',
          project: { name: 'Test Project' },
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          author: { name: 'Jane Doe' },
          assigned_to: { name: 'John Smith' },
          done_ratio: 50,
          description: 'This is a detailed description',
        },
      };

      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      const result = await getIssue({ id: 123 });

      expect(redmineClient.getIssue).toHaveBeenCalledWith(123, ['journals']);
      expect(result.content[0].text).toContain('#123 - Detailed Issue');
      expect(result.content[0].text).toContain('Assigned to: John Smith');
      expect(result.content[0].text).toContain('Progress: 50%');
    });

    it('should include additional data when requested', async () => {
      const mockIssue = {
        issue: {
          id: 123,
          subject: 'Issue with journals',
          project: { name: 'Test' },
          status: { name: 'New' },
          priority: { name: 'Normal' },
          author: { name: 'User' },
          done_ratio: 0,
        },
      };

      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      await getIssue({ id: 123, include: ['journals', 'attachments'] });

      expect(redmineClient.getIssue).toHaveBeenCalledWith(
        123,
        ['journals', 'attachments']
      );
    });

    it('does not render comments by default, but shows the count', async () => {
      const mockIssue = {
        issue: {
          id: 200,
          subject: 'Has comments',
          project: { name: 'P' },
          status: { name: 'New' },
          priority: { name: 'Normal' },
          author: { name: 'U' },
          done_ratio: 0,
          journals: [
            { id: 1, user: { id: 1, name: 'A' }, notes: 'first', created_on: '2026-07-01T00:00:00Z', private_notes: false },
            { id: 2, user: { id: 2, name: 'B' }, notes: 'second', created_on: '2026-07-02T00:00:00Z', private_notes: false },
          ],
        },
      };
      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      const result = await getIssue({ id: 200 });

      expect(result.content[0].text).toContain('Comments: 2 total (not shown');
      expect(result.content[0].text).not.toContain('first');
      expect(result.content[0].text).not.toContain('second');
    });

    it('renders comments when include_journals is true', async () => {
      const mockIssue = {
        issue: {
          id: 201, subject: 'S', project: { name: 'P' }, status: { name: 'New' },
          priority: { name: 'Normal' }, author: { name: 'U' }, done_ratio: 0,
          journals: [
            { id: 1, user: { id: 1, name: 'A' }, notes: 'older', created_on: '2026-07-01T00:00:00Z', private_notes: false },
            { id: 2, user: { id: 2, name: 'B' }, notes: 'newer', created_on: '2026-07-02T00:00:00Z', private_notes: false },
          ],
        },
      };
      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      const result = await getIssue({ id: 201, include_journals: true });

      expect(result.content[0].text).toContain('showing 0-1, newest first');
      expect(result.content[0].text).toContain('newer');
      expect(result.content[0].text).toContain('older');
    });

    it('truncates description when description_max_chars is set', async () => {
      const mockIssue = {
        issue: {
          id: 202, subject: 'S', project: { name: 'P' }, status: { name: 'New' },
          priority: { name: 'Normal' }, author: { name: 'U' }, done_ratio: 0,
          description: 'Z'.repeat(1000),
        },
      };
      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      const result = await getIssue({ id: 202, description_max_chars: 50 });

      expect(result.content[0].text).toContain('...');
      expect(result.content[0].text).not.toContain('Z'.repeat(200));
    });

    it('bridges include:[journals] to render comments', async () => {
      const mockIssue = {
        issue: {
          id: 203, subject: 'S', project: { name: 'P' }, status: { name: 'New' },
          priority: { name: 'Normal' }, author: { name: 'U' }, done_ratio: 0,
          journals: [
            { id: 1, user: { id: 1, name: 'A' }, notes: 'bridged', created_on: '2026-07-01T00:00:00Z', private_notes: false },
          ],
        },
      };
      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      const result = await getIssue({ id: 203, include: ['journals'] });

      expect(result.content[0].text).toContain('bridged');
    });

    it('lets explicit include_journals=false override the include bridge', async () => {
      const mockIssue = {
        issue: {
          id: 204, subject: 'S', project: { name: 'P' }, status: { name: 'New' },
          priority: { name: 'Normal' }, author: { name: 'U' }, done_ratio: 0,
          journals: [
            { id: 1, user: { id: 1, name: 'A' }, notes: 'hidden', created_on: '2026-07-01T00:00:00Z', private_notes: false },
          ],
        },
      };
      vi.mocked(redmineClient.getIssue).mockResolvedValue(mockIssue);

      const result = await getIssue({ id: 204, include: ['journals'], include_journals: false });

      expect(result.content[0].text).not.toContain('hidden');
      expect(result.content[0].text).toContain('not shown');
    });

    it('returns an error response when a param is out of range', async () => {
      const result = await getIssue({ id: 205, journals_limit: 999 });
      expect(result.isError).toBe(true);
    });
  });

  describe('createIssue', () => {
    it('should create an issue', async () => {
      const newIssue = {
        issue: {
          id: 456,
          subject: 'New Issue',
          project: { name: 'Test' },
          status: { name: 'New' },
          priority: { name: 'Normal' },
          author: { name: 'Creator' },
          done_ratio: 0,
        },
      };

      vi.mocked(redmineClient.createIssue).mockResolvedValue(newIssue);

      const result = await createIssue({
        project_id: 1,
        subject: 'New Issue',
        description: 'Description',
      });

      expect(redmineClient.createIssue).toHaveBeenCalledWith({
        project_id: 1,
        subject: 'New Issue',
        description: 'Description',
      });
      expect(result.content[0].text).toContain('Issue created successfully!');
      expect(result.content[0].text).toContain('#456 - New Issue');
    });

    it('should validate required fields', async () => {
      const result = await createIssue({
        subject: 'Missing project_id',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });
  });

  describe('updateIssue', () => {
    it('should update an issue and fetch updated data', async () => {
      vi.mocked(redmineClient.updateIssue).mockResolvedValue(undefined);
      vi.mocked(redmineClient.getIssue).mockResolvedValue({
        issue: {
          id: 123,
          subject: 'Updated Issue',
          project: { name: 'Test' },
          status: { name: 'Closed' },
          priority: { name: 'High' },
          author: { name: 'User' },
          done_ratio: 100,
        },
      });

      const result = await updateIssue({
        id: 123,
        status_id: 5,
        done_ratio: 100,
        notes: 'Closing issue',
      });

      expect(redmineClient.updateIssue).toHaveBeenCalledWith(123, {
        status_id: 5,
        done_ratio: 100,
        notes: 'Closing issue',
      });
      expect(result.content[0].text).toContain('Issue updated successfully!');
      expect(result.content[0].text).toContain('Status: Closed');
    });
  });

  describe('deleteIssue', () => {
    it('should delete an issue', async () => {
      vi.mocked(redmineClient.deleteIssue).mockResolvedValue(undefined);

      const result = await deleteIssue({ id: 123 });

      expect(redmineClient.deleteIssue).toHaveBeenCalledWith(123);
      expect(result.content[0].text).toContain('Issue #123 deleted successfully');
    });
  });
});

describe('Project Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listProjects', () => {
    it('should list projects', async () => {
      const mockProjects = {
        projects: [
          {
            id: 1,
            name: 'Project Alpha',
            identifier: 'project-alpha',
            status: 1,
            is_public: true,
          },
          {
            id: 2,
            name: 'Project Beta',
            identifier: 'project-beta',
            status: 1,
            is_public: false,
            description: 'Internal project',
          },
        ],
        total_count: 2,
      };

      vi.mocked(redmineClient.listProjects).mockResolvedValue(mockProjects);

      const result = await listProjects({ limit: 10 });

      expect(result.content[0].text).toContain('Found 2 project(s)');
      expect(result.content[0].text).toContain('Project Alpha (project-alpha)');
      expect(result.content[0].text).toContain('Public: Yes');
      expect(result.content[0].text).toContain('Internal project');
    });
  });

  describe('getProject', () => {
    it('should get project details with includes', async () => {
      const mockProject = {
        project: {
          id: 1,
          name: 'Detailed Project',
          identifier: 'detailed',
          status: 1,
          is_public: true,
          trackers: [
            { id: 1, name: 'Bug' },
            { id: 2, name: 'Feature' },
          ],
          issue_categories: [
            { id: 1, name: 'Frontend', assigned_to: { name: 'John' } },
          ],
        },
      };

      vi.mocked(redmineClient.getProject).mockResolvedValue(mockProject);

      const result = await getProject({
        id: 'detailed',
        include: ['trackers', 'issue_categories'],
      });

      expect(redmineClient.getProject).toHaveBeenCalledWith(
        'detailed',
        ['trackers', 'issue_categories']
      );
      expect(result.content[0].text).toContain('Detailed Project (detailed)');
      expect(result.content[0].text).toContain('Trackers:');
      expect(result.content[0].text).toContain('- Bug (ID: 1)');
      expect(result.content[0].text).toContain('Frontend (ID: 1) - Assigned to: John');
    });
  });

  describe('getProjectVersions', () => {
    it('should list project versions', async () => {
      const mockVersions = {
        versions: [
          {
            id: 1,
            project: { id: 1, name: 'Test' },
            name: '1.0',
            status: 'open',
            due_date: '2024-06-30',
            description: 'First release',
          },
          {
            id: 2,
            project: { id: 1, name: 'Test' },
            name: '2.0',
            status: 'locked',
          },
        ],
      };

      vi.mocked(redmineClient.listVersions).mockResolvedValue(mockVersions);

      const result = await getProjectVersions({ project_id: 'test' });

      expect(redmineClient.listVersions).toHaveBeenCalledWith('test');
      expect(result.content[0].text).toContain('Found 2 version(s)');
      expect(result.content[0].text).toContain('Version: 1.0 (ID: 1)');
      expect(result.content[0].text).toContain('Due date: 2024-06-30');
      expect(result.content[0].text).toContain('Description: First release');
    });
  });
});

describe('User Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listUsers', () => {
    it('should list users with filter', async () => {
      const mockUsers = {
        users: [
          {
            id: 1,
            login: 'johndoe',
            firstname: 'John',
            lastname: 'Doe',
            mail: 'john@example.com',
            admin: false,
          },
          {
            id: 2,
            login: 'admin',
            firstname: 'Admin',
            lastname: 'User',
            admin: true,
          },
        ],
        total_count: 2,
      };

      vi.mocked(redmineClient.listUsers).mockResolvedValue(mockUsers);

      const result = await listUsers({ name: 'john' });

      expect(redmineClient.listUsers).toHaveBeenCalledWith({
        name: 'john',
        offset: 0,
        limit: 25,
      });
      expect(result.content[0].text).toContain('Found 2 user(s) matching "john"');
      expect(result.content[0].text).toContain('John Doe (johndoe)');
      expect(result.content[0].text).toContain('Email: john@example.com');
      expect(result.content[0].text).toContain('Role: Administrator');
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user info', async () => {
      const mockUser = {
        user: {
          id: 1,
          login: 'current',
          firstname: 'Current',
          lastname: 'User',
          mail: 'current@example.com',
          admin: false,
          last_login_on: '2024-01-15T10:00:00Z',
        },
      };

      vi.mocked(redmineClient.getCurrentUser).mockResolvedValue(mockUser);

      const result = await getCurrentUser({});

      expect(redmineClient.getCurrentUser).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Current User:');
      expect(result.content[0].text).toContain('Current User (current)');
      expect(result.content[0].text).toContain('Last login: 2024-01-15T10:00:00Z');
    });
  });

  describe('getUser', () => {
    it('should get user with memberships', async () => {
      const mockUser = {
        user: {
          id: 1,
          login: 'testuser',
          firstname: 'Test',
          lastname: 'User',
          memberships: [
            {
              project: { name: 'Project A' },
              roles: [{ name: 'Developer' }, { name: 'Reporter' }],
            },
          ],
          groups: [
            { id: 1, name: 'Developers' },
          ],
        },
      };

      vi.mocked(redmineClient.getUser).mockResolvedValue(mockUser as any);

      const result = await getUser({
        id: 1,
        include: ['memberships', 'groups'],
      });

      expect(redmineClient.getUser).toHaveBeenCalledWith(
        1,
        ['memberships', 'groups']
      );
      expect(result.content[0].text).toContain('Memberships:');
      expect(result.content[0].text).toContain('- Project A (Developer, Reporter)');
      expect(result.content[0].text).toContain('Groups:');
      expect(result.content[0].text).toContain('- Developers (ID: 1)');
    });
  });
});

describe('Time Entry Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listTimeEntries', () => {
    it('should list time entries with total hours', async () => {
      const mockEntries = {
        time_entries: [
          {
            id: 1,
            project: { id: 1, name: 'Project A' },
            user: { id: 1, name: 'John Doe' },
            activity: { id: 9, name: 'Development' },
            hours: 2.5,
            spent_on: '2024-01-15',
            comments: 'Working on feature X',
          },
          {
            id: 2,
            project: { id: 1, name: 'Project A' },
            user: { id: 1, name: 'John Doe' },
            activity: { id: 10, name: 'Testing' },
            hours: 1.5,
            spent_on: '2024-01-15',
          },
        ],
        total_count: 2,
      };

      vi.mocked(redmineClient.listTimeEntries).mockResolvedValue(mockEntries);

      const result = await listTimeEntries({
        user_id: 'me',
        from: '2024-01-15',
        to: '2024-01-15',
      });

      expect(result.content[0].text).toContain('Found 2 time entry(ies)');
      expect(result.content[0].text).toContain('Total hours: 4.00');
      expect(result.content[0].text).toContain('Hours: 2.5');
      expect(result.content[0].text).toContain('Activity: Development');
      expect(result.content[0].text).toContain('Comments: Working on feature X');
    });
  });

  describe('createTimeEntry', () => {
    it('should create time entry', async () => {
      const newEntry = {
        time_entry: {
          id: 123,
          project: { id: 1, name: 'Project A' },
          issue: { id: 456 },
          user: { id: 1, name: 'John Doe' },
          activity: { id: 9, name: 'Development' },
          hours: 3,
          spent_on: '2024-01-15',
          comments: 'Implemented login',
        },
      };

      vi.mocked(redmineClient.createTimeEntry).mockResolvedValue(newEntry);

      const result = await createTimeEntry({
        issue_id: 456,
        hours: 3,
        activity_id: 9,
        comments: 'Implemented login',
      });

      expect(result.content[0].text).toContain('Time entry created successfully!');
      expect(result.content[0].text).toContain('Time Entry #123');
      expect(result.content[0].text).toContain('Issue: #456');
    });

    it('should validate required fields', async () => {
      const result = await createTimeEntry({
        hours: 3,
        // Missing activity_id and issue_id/project_id
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });
  });

  describe('listTimeEntryActivities', () => {
    it('should list activities', async () => {
      const mockActivities = {
        time_entry_activities: [
          { id: 9, name: 'Development', is_default: true, active: true },
          { id: 10, name: 'Testing', is_default: false, active: true },
          { id: 11, name: 'Documentation', is_default: false, active: false },
        ],
      };

      vi.mocked(redmineClient.listTimeEntryActivities).mockResolvedValue(mockActivities);

      const result = await listTimeEntryActivities({});

      expect(result.content[0].text).toContain('Available Time Entry Activities:');
      expect(result.content[0].text).toContain('- Development (ID: 9) [DEFAULT]');
      expect(result.content[0].text).toContain('- Documentation (ID: 11) [INACTIVE]');
    });
  });
});

describe('Wiki Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listWikiPages', () => {
    it('should list wiki pages with hierarchy', async () => {
      const mockPages = {
        wiki_pages: [
          { title: 'Home', version: 5 },
          { title: 'Documentation', version: 3 },
          { title: 'API Reference', version: 2, parent: { title: 'Documentation' } },
          { title: 'Installation', version: 1, parent: { title: 'Documentation' } },
        ],
      };

      vi.mocked(redmineClient.listWikiPages).mockResolvedValue(mockPages);

      const result = await listWikiPages({ project_id: 'test' });

      expect(redmineClient.listWikiPages).toHaveBeenCalledWith('test');
      expect(result.content[0].text).toContain('Found 4 wiki page(s)');
      expect(result.content[0].text).toContain('- Home (v5)');
      expect(result.content[0].text).toContain('- Documentation (v3)');
      expect(result.content[0].text).toContain('  - API Reference (v2)');
      expect(result.content[0].text).toContain('  - Installation (v1)');
    });
  });

  describe('getWikiPage', () => {
    it('should get wiki page content', async () => {
      const mockPage = {
        wiki_page: {
          title: 'Home',
          version: 5,
          author: { id: 1, name: 'John Doe' },
          text: '# Welcome\n\nThis is the home page.',
          updated_on: '2024-01-15',
        },
      };

      vi.mocked(redmineClient.getWikiPage).mockResolvedValue(mockPage);

      const result = await getWikiPage({
        project_id: 'test',
        title: 'Home',
      });

      expect(redmineClient.getWikiPage).toHaveBeenCalledWith('test', 'Home', undefined);
      expect(result.content[0].text).toContain('Wiki Page: Home');
      expect(result.content[0].text).toContain('Version: 5');
      expect(result.content[0].text).toContain('Author: John Doe');
      expect(result.content[0].text).toContain('# Welcome');
    });
  });

  describe('createOrUpdateWikiPage', () => {
    it('should create or update wiki page', async () => {
      vi.mocked(redmineClient.createOrUpdateWikiPage).mockResolvedValue(undefined);
      vi.mocked(redmineClient.getWikiPage).mockResolvedValue({
        wiki_page: {
          title: 'NewPage',
          version: 1,
          text: '# New Page Content',
          updated_on: '2024-01-15',
        },
      });

      const result = await createOrUpdateWikiPage({
        project_id: 'test',
        title: 'NewPage',
        text: '# New Page Content',
        comments: 'Initial creation',
      });

      expect(redmineClient.createOrUpdateWikiPage).toHaveBeenCalledWith(
        'test',
        'NewPage',
        {
          text: '# New Page Content',
          comments: 'Initial creation',
        }
      );
      expect(result.content[0].text).toContain('Wiki page saved successfully!');
    });
  });

  describe('deleteWikiPage', () => {
    it('should delete wiki page', async () => {
      vi.mocked(redmineClient.deleteWikiPage).mockResolvedValue(undefined);

      const result = await deleteWikiPage({
        project_id: 'test',
        title: 'OldPage',
      });

      expect(redmineClient.deleteWikiPage).toHaveBeenCalledWith('test', 'OldPage');
      expect(result.content[0].text).toContain('Wiki page "OldPage" deleted successfully');
    });
  });
});

describe('Journal Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('updateJournal', () => {
    it('should update a journal', async () => {
      vi.mocked(redmineClient.updateJournal).mockResolvedValue(undefined);

      const result = await updateJournal({
        id: 10,
        notes: 'Updated comment',
        private_notes: true,
      });

      expect(redmineClient.updateJournal).toHaveBeenCalledWith(10, {
        notes: 'Updated comment',
        private_notes: true,
      });
      expect(result.content[0].text).toContain('Journal #10 updated successfully');
    });

    it('should handle errors', async () => {
      vi.mocked(redmineClient.updateJournal).mockRejectedValue(new Error('Not found'));

      const result = await updateJournal({ id: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Not found');
    });
  });
});

describe('Attachment Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAttachment', () => {
    it('should get attachment details', async () => {
      const mockAttachment = {
        attachment: {
          id: 1,
          filename: 'test.pdf',
          filesize: 2048,
          content_type: 'application/pdf',
          content_url: 'https://redmine.example.com/attachments/download/1/test.pdf',
          author: { id: 1, name: 'John Doe' },
          created_on: '2024-01-15',
          description: 'A test file',
        },
      };

      vi.mocked(redmineClient.getAttachment).mockResolvedValue(mockAttachment);

      const result = await getAttachment({ id: 1 });

      expect(redmineClient.getAttachment).toHaveBeenCalledWith(1);
      expect(result.content[0].text).toContain('Attachment #1');
      expect(result.content[0].text).toContain('Filename: test.pdf');
      expect(result.content[0].text).toContain('Size: 2048 bytes');
      expect(result.content[0].text).toContain('Author: John Doe');
      expect(result.content[0].text).toContain('Description: A test file');
    });

    it('should handle errors', async () => {
      vi.mocked(redmineClient.getAttachment).mockRejectedValue(new Error('Not found'));

      const result = await getAttachment({ id: 999 });

      expect(result.isError).toBe(true);
    });
  });

  describe('downloadAttachment', () => {
    const bytes = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256));
    const metadata = (filesize: number, filename = 'shot.png') => ({
      attachment: {
        id: 7,
        filename,
        filesize,
        content_type: 'image/png',
        content_url: 'https://elsewhere.example/attachments/download/7/shot.png',
        author: { id: 1, name: 'a' },
        created_on: '2026-01-01T00:00:00Z',
      },
    });
    let root: string;
    let dir: string;

    beforeEach(async () => {
      root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'redmine-download-'));
      dir = path.join(root, 'downloads');
      config.redmine.downloadDir = dir;
      vi.mocked(redmineClient.getAttachment).mockResolvedValue(metadata(bytes.length));
      vi.mocked(redmineClient.downloadAttachment).mockResolvedValue(bytes);
    });

    afterEach(async () => {
      config.redmine.downloadDir = undefined;
      await fs.promises.rm(root, { recursive: true, force: true });
    });

    it('should be registered as a tool with a handler', () => {
      expect(tools.map((t) => t.name)).toContain('redmine_download_attachment');
      expect(toolHandlers.redmine_download_attachment).toBe(downloadAttachment);
    });

    it('should not offer the caller a choice of location', () => {
      const tool = tools.find((t) => t.name === 'redmine_download_attachment');

      expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(['id']);
    });

    it('should save the exact bytes in the download folder', async () => {
      const result = await downloadAttachment({ id: 7 });
      const saved = path.join(dir, '7-shot.png');

      expect(result.isError).toBeUndefined();
      expect(redmineClient.downloadAttachment).toHaveBeenCalledWith(7, 'shot.png');
      expect((await fs.promises.readFile(saved)).equals(bytes)).toBe(true);
      expect(result.content[0].text).toContain(saved);
      expect(result.content[0].text).toContain('512 bytes');
    });

    it('should default to redmine-attachments in the home directory', async () => {
      config.redmine.downloadDir = undefined;
      const homedir = vi.spyOn(os, 'homedir').mockReturnValue(root);

      try {
        const result = await downloadAttachment({ id: 7 });

        expect(result.isError).toBeUndefined();
        await fs.promises.access(path.join(root, 'redmine-attachments', '7-shot.png'));
      } finally {
        homedir.mockRestore();
      }
    });

    it('should expand a leading ~/ in the configured folder', async () => {
      config.redmine.downloadDir = '~/from-env';
      const homedir = vi.spyOn(os, 'homedir').mockReturnValue(root);

      try {
        await downloadAttachment({ id: 7 });

        await fs.promises.access(path.join(root, 'from-env', '7-shot.png'));
      } finally {
        homedir.mockRestore();
      }
    });

    it('should reject a relative configured folder', async () => {
      config.redmine.downloadDir = 'downloads';

      const result = await downloadAttachment({ id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('REDMINE_DOWNLOAD_DIR');
      expect(redmineClient.downloadAttachment).not.toHaveBeenCalled();
    });

    it('should ignore a location supplied by the caller', async () => {
      const elsewhere = path.join(root, 'elsewhere.png');

      const result = await downloadAttachment({ id: 7, save_path: elsewhere });

      expect(result.content[0].text).toContain(path.join(dir, '7-shot.png'));
      await expect(fs.promises.stat(elsewhere)).rejects.toThrow('ENOENT');
    });

    it('should keep a hostile server filename inside the download folder', async () => {
      vi.mocked(redmineClient.getAttachment).mockResolvedValue(
        metadata(bytes.length, '../..\\../.zshrc\n')
      );

      await downloadAttachment({ id: 7 });

      expect(await fs.promises.readdir(root)).toEqual(['downloads']);
      const [name] = await fs.promises.readdir(dir);
      expect(name.startsWith('7-')).toBe(true);
      expect(name).not.toMatch(/[/\\\n]/);
    });

    it('should create the folder and file private to their owner', async () => {
      await downloadAttachment({ id: 7 });

      expect((await fs.promises.stat(dir)).mode & 0o777).toBe(0o700);
      expect((await fs.promises.stat(path.join(dir, '7-shot.png'))).mode & 0o777).toBe(0o600);
    });

    it('should refuse to replace a file that is already there', async () => {
      const saved = path.join(dir, '7-shot.png');
      await fs.promises.mkdir(dir);
      await fs.promises.writeFile(saved, 'keep me');

      const result = await downloadAttachment({ id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(saved);
      expect(await fs.promises.readFile(saved, 'utf8')).toBe('keep me');
    });

    it('should refuse to write through a symlink', async () => {
      const target = path.join(root, 'target');
      await fs.promises.mkdir(dir);
      await fs.promises.writeFile(target, 'keep me');
      await fs.promises.symlink(target, path.join(dir, '7-shot.png'));

      const result = await downloadAttachment({ id: 7 });

      expect(result.isError).toBe(true);
      expect(await fs.promises.readFile(target, 'utf8')).toBe('keep me');
    });

    it('should not save a response whose size differs from the attachment', async () => {
      // An invalid key can follow a redirect to the HTML login page with status 200.
      vi.mocked(redmineClient.downloadAttachment).mockResolvedValue(Buffer.from('<html>login</html>'));

      const result = await downloadAttachment({ id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('512');
      await expect(fs.promises.stat(path.join(dir, '7-shot.png'))).rejects.toThrow('ENOENT');
    });

    it('should not create a file when the download fails', async () => {
      vi.mocked(redmineClient.downloadAttachment).mockRejectedValue(new Error('Not found'));

      const result = await downloadAttachment({ id: 7 });

      expect(result.isError).toBe(true);
      await expect(fs.promises.stat(path.join(dir, '7-shot.png'))).rejects.toThrow('ENOENT');
    });

    it('should require id', async () => {
      expect((await downloadAttachment({})).isError).toBe(true);
      expect(redmineClient.downloadAttachment).not.toHaveBeenCalled();
    });
  });

  describe('updateAttachment', () => {
    it('should update an attachment', async () => {
      vi.mocked(redmineClient.updateAttachment).mockResolvedValue(undefined);

      const result = await updateAttachment({
        id: 1,
        filename: 'renamed.pdf',
        description: 'Updated description',
      });

      expect(redmineClient.updateAttachment).toHaveBeenCalledWith(1, {
        filename: 'renamed.pdf',
        description: 'Updated description',
      });
      expect(result.content[0].text).toContain('Attachment #1 updated successfully');
    });
  });

  describe('deleteAttachment', () => {
    it('should delete an attachment', async () => {
      vi.mocked(redmineClient.deleteAttachment).mockResolvedValue(undefined);

      const result = await deleteAttachment({ id: 1 });

      expect(redmineClient.deleteAttachment).toHaveBeenCalledWith(1);
      expect(result.content[0].text).toContain('Attachment #1 deleted successfully');
    });
  });
});

describe('File Tools', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listFiles', () => {
    it('should list project files', async () => {
      const mockFiles = {
        files: [
          {
            id: 1,
            filename: 'doc.pdf',
            filesize: 4096,
            content_url: 'https://redmine.example.com/attachments/download/1/doc.pdf',
            author: { id: 1, name: 'Jane Doe' },
            created_on: '2024-01-15',
            downloads: 5,
            digest: 'abc123',
          },
        ],
      };

      vi.mocked(redmineClient.listFiles).mockResolvedValue(mockFiles);

      const result = await listFiles({ project_id: 'test-project' });

      expect(redmineClient.listFiles).toHaveBeenCalledWith('test-project');
      expect(result.content[0].text).toContain('Found 1 file(s)');
      expect(result.content[0].text).toContain('File #1');
      expect(result.content[0].text).toContain('Filename: doc.pdf');
      expect(result.content[0].text).toContain('Downloads: 5');
    });

    it('should handle empty results', async () => {
      vi.mocked(redmineClient.listFiles).mockResolvedValue({ files: [] });

      const result = await listFiles({ project_id: 'empty-project' });

      expect(result.content[0].text).toContain('No files found');
    });
  });

  describe('createFile', () => {
    it('should create a file in project', async () => {
      vi.mocked(redmineClient.createFile).mockResolvedValue(undefined);

      const result = await createFile({
        project_id: 'test-project',
        token: 'upload-token-123',
        version_id: 1,
        filename: 'release.zip',
      });

      expect(redmineClient.createFile).toHaveBeenCalledWith('test-project', {
        token: 'upload-token-123',
        version_id: 1,
        filename: 'release.zip',
      });
      expect(result.content[0].text).toContain('File added to project "test-project" successfully');
    });

    it('should validate required token', async () => {
      const result = await createFile({
        project_id: 'test-project',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });
  });

  describe('uploadFile', () => {
    it('should upload file and return token', async () => {
      vi.mocked(redmineClient.uploadFile).mockResolvedValue({
        upload: { token: 'returned-token-789' },
      });

      const base64Content = Buffer.from('test file content').toString('base64');
      const result = await uploadFile({
        content_base64: base64Content,
        filename: 'test.txt',
      });

      expect(redmineClient.uploadFile).toHaveBeenCalledWith(
        Buffer.from(base64Content, 'base64'),
        'test.txt'
      );
      expect(result.content[0].text).toContain('File uploaded successfully');
      expect(result.content[0].text).toContain('Token: returned-token-789');
    });

    it('should validate required content_base64', async () => {
      const result = await uploadFile({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });

    it('should read from file_path and derive the filename', async () => {
      vi.mocked(redmineClient.uploadFile).mockResolvedValue({
        upload: { token: 'file-path-token' },
      });

      const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'redmine-upload-'));
      const filePath = path.join(dir, 'design.md');
      await fs.promises.writeFile(filePath, '# design\n');

      try {
        const result = await uploadFile({ file_path: filePath });

        expect(redmineClient.uploadFile).toHaveBeenCalledWith(
          Buffer.from('# design\n'),
          'design.md'
        );
        expect(result.content[0].text).toContain('Token: file-path-token');
        expect(result.content[0].text).toContain('Filename: design.md');
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true });
      }
    });

    it('should reject when both content_base64 and file_path are given', async () => {
      const result = await uploadFile({
        content_base64: Buffer.from('x').toString('base64'),
        file_path: '/tmp/x.md',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('exactly one');
      expect(redmineClient.uploadFile).not.toHaveBeenCalled();
    });

    it('should expand a leading ~/ in file_path', async () => {
      vi.mocked(redmineClient.uploadFile).mockResolvedValue({
        upload: { token: 'home-token' },
      });

      const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'redmine-upload-'));
      await fs.promises.writeFile(path.join(dir, 'home.md'), 'from home');
      const homedir = vi.spyOn(os, 'homedir').mockReturnValue(dir);

      try {
        const result = await uploadFile({ file_path: '~/home.md' });

        expect(result.isError).toBeUndefined();
        expect(redmineClient.uploadFile).toHaveBeenCalledWith(
          Buffer.from('from home'),
          'home.md'
        );
      } finally {
        homedir.mockRestore();
        await fs.promises.rm(dir, { recursive: true, force: true });
      }
    });

    it('should reject a relative file_path', async () => {
      const result = await uploadFile({ file_path: 'design.md' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('absolute');
      expect(redmineClient.uploadFile).not.toHaveBeenCalled();
    });

    describe('hidden paths', () => {
      let dir: string;

      beforeEach(async () => {
        dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'redmine-upload-'));
        await fs.promises.mkdir(path.join(dir, '.ssh'));
        await fs.promises.writeFile(path.join(dir, '.ssh', 'id_rsa'), 'secret');
        await fs.promises.writeFile(path.join(dir, '.env'), 'SECRET=1');
      });

      afterEach(async () => {
        await fs.promises.rm(dir, { recursive: true, force: true });
      });

      const expectRefused = async (filePath: string) => {
        const result = await uploadFile({ file_path: filePath });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('hidden');
        expect(redmineClient.uploadFile).not.toHaveBeenCalled();
      };

      it('should refuse a file inside a hidden directory', async () => {
        await expectRefused(path.join(dir, '.ssh', 'id_rsa'));
      });

      it('should refuse a hidden file', async () => {
        await expectRefused(path.join(dir, '.env'));
      });

      it('should refuse a hidden path reached through ~/', async () => {
        const homedir = vi.spyOn(os, 'homedir').mockReturnValue(dir);

        try {
          await expectRefused('~/.ssh/id_rsa');
        } finally {
          homedir.mockRestore();
        }
      });

      it('should refuse a hidden path reached through ..', async () => {
        await fs.promises.mkdir(path.join(dir, 'sub'));

        await expectRefused(`${dir}/sub/../.ssh/id_rsa`);
      });

      it('should refuse a symlink that points at a hidden path', async () => {
        const link = path.join(dir, 'harmless.txt');
        await fs.promises.symlink(path.join(dir, '.ssh', 'id_rsa'), link);

        await expectRefused(link);
      });

      it('should name a symlink upload after the link', async () => {
        vi.mocked(redmineClient.uploadFile).mockResolvedValue({ upload: { token: 't' } });
        const target = path.join(dir, 'target.md');
        const link = path.join(dir, 'link.md');
        await fs.promises.writeFile(target, 'plain');
        await fs.promises.symlink(target, link);

        const result = await uploadFile({ file_path: link });

        expect(result.isError).toBeUndefined();
        expect(redmineClient.uploadFile).toHaveBeenCalledWith(Buffer.from('plain'), 'link.md');
      });
    });

    it('should surface a missing file_path as an error', async () => {
      const result = await uploadFile({
        file_path: path.join(os.tmpdir(), 'redmine-upload-does-not-exist.md'),
      });

      expect(result.isError).toBe(true);
      expect(redmineClient.uploadFile).not.toHaveBeenCalled();
    });
  });
});

describe('Custom Request Tool', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should make custom API requests with safe relative paths', async () => {
    vi.mocked(redmineClient.customRequest).mockResolvedValue({ ok: true });

    const result = await customRequest({
      method: 'GET',
      path: '/issues.json',
      params: { limit: 10 },
    });

    expect(redmineClient.customRequest).toHaveBeenCalledWith(
      'GET',
      '/issues.json',
      undefined,
      { limit: 10 }
    );
    expect(result.content[0].text).toContain('"ok": true');
  });

  it.each([
    'https://example.com/issues.json',
    'http://example.com/issues.json',
    '//example.com/issues.json',
    '../issues.json',
    '/projects/../issues.json',
    '/issues.json?limit=1',
    '/issues.json#section',
  ])('should reject unsafe custom API path %s before calling the client', async (path) => {
    const result = await customRequest({
      method: 'GET',
      path,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
    expect(redmineClient.customRequest).not.toHaveBeenCalled();
  });
});
