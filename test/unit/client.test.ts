import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { RedmineClient } from '../../src/client/index.js';
import { config } from '../../src/config.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// Mock config
vi.mock('../../src/config.js', () => ({
  config: {
    redmine: {
      url: 'https://test.redmine.com',
      apiKey: 'test-api-key',
      sslVerify: true,
      requestTimeout: 30000,
      maxRetries: 3,
    },
    logging: {
      level: 'info',
      otelLevel: 'none',
    },
  },
}));

describe('RedmineClient', () => {
  let client: RedmineClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    client = new RedmineClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://test.redmine.com',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-Redmine-API-Key': 'test-api-key',
        },
      });
    });

    it('should setup retry interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('listProjects', () => {
    it('should fetch projects list', async () => {
      const mockResponse = {
        data: {
          projects: [
            { id: 1, name: 'Project 1' },
            { id: 2, name: 'Project 2' },
          ],
          total_count: 2,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listProjects({ limit: 10, offset: 0 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/projects.json', {
        params: { limit: 10, offset: 0 },
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getProject', () => {
    it('should fetch project details', async () => {
      const mockResponse = {
        data: {
          project: {
            id: 1,
            name: 'Test Project',
            identifier: 'test-project',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getProject(1);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/projects/1.json', {
        params: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should include additional data when requested', async () => {
      const mockResponse = {
        data: {
          project: {
            id: 1,
            name: 'Test Project',
            trackers: [{ id: 1, name: 'Bug' }],
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getProject(1, ['trackers']);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/projects/1.json', {
        params: { include: 'trackers' },
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('listIssues', () => {
    it('should fetch issues with query parameters', async () => {
      const mockResponse = {
        data: {
          issues: [
            { id: 1, subject: 'Issue 1' },
            { id: 2, subject: 'Issue 2' },
          ],
          total_count: 2,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const query = {
        project_id: 1,
        status_id: 'open',
        limit: 25,
      };

      const result = await client.listIssues(query);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/issues.json', {
        params: query,
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('createIssue', () => {
    it('should create a new issue', async () => {
      const mockResponse = {
        data: {
          issue: {
            id: 123,
            subject: 'New Issue',
            project: { id: 1, name: 'Test Project' },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const issueData = {
        project_id: 1,
        subject: 'New Issue',
        description: 'Issue description',
      };

      const result = await client.createIssue(issueData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/issues.json', {
        issue: issueData,
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('updateIssue', () => {
    it('should update an existing issue', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: {} });

      const updateData = {
        subject: 'Updated Subject',
        done_ratio: 50,
      };

      await client.updateIssue(123, updateData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/issues/123.json', {
        issue: updateData,
      });
    });
  });

  describe('deleteIssue', () => {
    it('should delete an issue', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: {} });

      await client.deleteIssue(123);

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/issues/123.json');
    });
  });

  describe('listTimeEntries', () => {
    it('should fetch time entries', async () => {
      const mockResponse = {
        data: {
          time_entries: [
            { id: 1, hours: 2.5, activity: { id: 9, name: 'Development' } },
          ],
          total_count: 1,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const query = {
        user_id: 'me',
        from: '2024-01-01',
        to: '2024-01-31',
      };

      const result = await client.listTimeEntries(query);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/time_entries.json', {
        params: query,
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('createTimeEntry', () => {
    it('should create a time entry', async () => {
      const mockResponse = {
        data: {
          time_entry: {
            id: 456,
            hours: 3,
            spent_on: '2024-01-15',
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const entryData = {
        issue_id: 123,
        hours: 3,
        activity_id: 9,
        comments: 'Worked on feature',
      };

      const result = await client.createTimeEntry(entryData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/time_entries.json', {
        time_entry: entryData,
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getCurrentUser', () => {
    it('should fetch current user info', async () => {
      const mockResponse = {
        data: {
          user: {
            id: 1,
            login: 'testuser',
            firstname: 'Test',
            lastname: 'User',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getCurrentUser();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/current.json');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('listWikiPages', () => {
    it('should fetch wiki pages for a project', async () => {
      const mockResponse = {
        data: {
          wiki_pages: [
            { title: 'Home', version: 1 },
            { title: 'Documentation', version: 3 },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listWikiPages('test-project');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-project/wiki/index.json'
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getWikiPage', () => {
    it('should fetch wiki page content', async () => {
      const mockResponse = {
        data: {
          wiki_page: {
            title: 'Home',
            text: '# Welcome\n\nThis is the home page.',
            version: 1,
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getWikiPage('test-project', 'Home');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-project/wiki/Home.json'
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should fetch specific version of wiki page', async () => {
      const mockResponse = {
        data: {
          wiki_page: {
            title: 'Home',
            text: 'Old version content',
            version: 2,
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getWikiPage('test-project', 'Home', 2);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-project/wiki/Home/2.json'
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('customRequest', () => {
    it('should make custom API request', async () => {
      const mockResponse = {
        data: {
          custom: 'response',
        },
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.customRequest(
        'GET',
        '/custom/endpoint.json',
        undefined,
        { param: 'value' }
      );

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/custom/endpoint.json',
        data: undefined,
        params: { param: 'value' },
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('error handling', () => {
    it('should retry on network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNABORTED';

      mockAxiosInstance.get
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: { projects: [] } });

      // Manually trigger the interceptor
      const interceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
      
      const config = { retryCount: 0 };
      const promise = interceptor({ code: 'ECONNABORTED', config });

      // Wait a bit for the retry delay
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockAxiosInstance).toHaveBeenCalled();
    });

    it('should not retry after max retries', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNABORTED';

      const interceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
      
      const config = { retryCount: 3 }; // Already at max retries
      
      await expect(interceptor({ code: 'ECONNABORTED', config }))
        .rejects.toMatchObject({ code: 'ECONNABORTED' });
    });
  });
});