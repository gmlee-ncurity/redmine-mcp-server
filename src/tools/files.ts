import fs from 'fs';
import os from 'os';
import path from 'path';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { redmineClient } from '../client/index.js';
import { config } from '../config.js';
import { formatFile, formatList } from '../utils/formatters.js';
import { ConfigurationError, formatErrorResponse, ValidationError } from '../utils/errors.js';
import { validateInput, createFileSchema, uploadFileSchema } from '../utils/validators.js';

// Local file access is only safe on stdio, where the server runs as the user. On
// streamable-http it would give callers file access on the host.
function requireStdio(feature: string): void {
  if (config.transport.type !== 'stdio') {
    throw new ValidationError(`${feature} is only available on the stdio transport`);
  }
}

function expandHome(input: string): string {
  return input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input;
}

// The path can originate from untrusted issue text, and whatever it names ends up in
// Redmine, so hidden paths, where credentials usually live, are refused.
// ponytail: a deny rule, not a sandbox. Paths such as /etc stay readable; add an
// allowed-folders setting if that matters.
export async function resolveUploadPath(input: string): Promise<string> {
  requireStdio('file_path');
  const expanded = expandHome(input);
  // A relative path would resolve against the server process's cwd, not the caller's.
  if (!path.isAbsolute(expanded)) {
    throw new ValidationError('file_path must be an absolute path', 'file_path');
  }
  // realpath, so that neither a symlink nor .. can reach a hidden path.
  const real = await fs.promises.realpath(expanded);
  if (real.split(path.sep).some((segment) => segment.startsWith('.'))) {
    throw new ValidationError('file_path must not point to a hidden file or directory', 'file_path');
  }
  return real;
}

// Downloaded content is untrusted, so where it lands is the operator's choice, never
// the caller's: otherwise it could plant files that something else later runs.
export function resolveDownloadDir(): string {
  requireStdio('redmine_download_attachment');
  const dir = expandHome(config.redmine.downloadDir ?? path.join(os.homedir(), 'redmine-attachments'));
  if (!path.isAbsolute(dir)) {
    throw new ConfigurationError('REDMINE_DOWNLOAD_DIR must be an absolute path');
  }
  return dir;
}

// List files tool
export const listFilesTool: Tool = {
  name: 'redmine_list_files',
  description: 'List files for a specific project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID or identifier',
      },
    },
    required: ['project_id'],
  },
};

export async function listFiles(input: unknown) {
  try {
    const { project_id } = input as { project_id: string | number };

    const response = await redmineClient.listFiles(project_id);
    const files = response.files || [];

    let content = `Found ${files.length} file(s)\n\n`;

    if (files.length > 0) {
      content += formatList(files, formatFile);
    } else {
      content += 'No files found for this project.';
    }

    return {
      content: [{ type: 'text', text: content }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true,
    };
  }
}

// Create file tool
export const createFileTool: Tool = {
  name: 'redmine_create_file',
  description: 'Add a previously uploaded file to a project',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID or identifier',
      },
      token: {
        type: 'string',
        description: 'Upload token returned by redmine_upload_file',
      },
      version_id: {
        type: 'number',
        description: 'Version ID to associate the file with',
      },
      filename: {
        type: 'string',
        description: 'Filename to use',
      },
      description: {
        type: 'string',
        description: 'File description',
      },
    },
    required: ['project_id', 'token'],
  },
};

export async function createFile(input: unknown) {
  try {
    const { project_id, ...fileData } = input as { project_id: string | number; [key: string]: unknown };
    const validatedData = validateInput(createFileSchema, fileData);

    await redmineClient.createFile(project_id, validatedData);

    return {
      content: [{ type: 'text', text: `File added to project "${project_id}" successfully.` }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true,
    };
  }
}

// Upload file tool
export const uploadFileTool: Tool = {
  name: 'redmine_upload_file',
  description: 'Upload a file to Redmine and get an upload token. Provide exactly one of file_path (preferred) or content_base64. The token can then be used with redmine_create_file or when creating/updating issues with attachments.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description:
          'Absolute path to a local file to upload. Preferred for anything but tiny files: the server reads the bytes from disk, so they never pass through the conversation. Only available on the stdio transport, where the server runs on the same machine as the file. Hidden files and directories are refused. A leading "~/" is expanded to the home directory.',
      },
      content_base64: {
        type: 'string',
        description:
          'File content encoded as a base64 string. Use only when file_path is unavailable (streamable-http transport) or the bytes have no path on disk.',
      },
      filename: {
        type: 'string',
        description:
          'Filename to register the upload under. Defaults to the basename of file_path. Pass it explicitly with content_base64: without it Redmine assigns a random hex name unless the uploads[] entry sets filename.',
      },
    },
  },
};

export async function uploadFile(input: unknown) {
  try {
    const validatedData = validateInput(uploadFileSchema, input);
    let content: Buffer;
    let filename = validatedData.filename;

    if (validatedData.content_base64) {
      content = Buffer.from(validatedData.content_base64, 'base64');
    } else if (validatedData.file_path) {
      content = await fs.promises.readFile(await resolveUploadPath(validatedData.file_path));
      filename = filename || path.basename(validatedData.file_path);
    } else {
      throw new ValidationError('Provide exactly one of content_base64 or file_path');
    }

    const response = await redmineClient.uploadFile(content, filename);

    return {
      content: [{
        type: 'text',
        text: `File uploaded successfully!\nToken: ${response.upload.token}${filename ? `\nFilename: ${filename}` : ''}\n\nUse this token with redmine_create_file or when creating/updating issues with attachments.`,
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true,
    };
  }
}
