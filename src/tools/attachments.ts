import fs from 'fs';
import path from 'path';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { redmineClient } from '../client/index.js';
import { formatAttachment } from '../utils/formatters.js';
import { formatErrorResponse } from '../utils/errors.js';
import { validateInput, parseId, updateAttachmentSchema, downloadAttachmentSchema } from '../utils/validators.js';
import { resolveDownloadDir } from './files.js';

// Get attachment tool
export const getAttachmentTool: Tool = {
  name: 'redmine_get_attachment',
  description: 'Get detailed information about a specific attachment',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'Attachment ID',
      },
    },
    required: ['id'],
  },
};

export async function getAttachment(input: unknown) {
  try {
    const { id } = input as { id: number };
    const attachmentId = parseId(id);

    const response = await redmineClient.getAttachment(attachmentId);
    const content = formatAttachment(response.attachment);

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

// Download attachment tool
export const downloadAttachmentTool: Tool = {
  name: 'redmine_download_attachment',
  description: 'Download an attachment to the configured download folder and return the saved path. The bytes are written to disk rather than returned, so this works for binary files such as images. Refuses to replace an existing file. Only available on the stdio transport. Find attachment IDs with redmine_get_issue and include: ["attachments"].',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'Attachment ID',
      },
    },
    required: ['id'],
  },
};

export async function downloadAttachment(input: unknown) {
  try {
    const { id } = validateInput(downloadAttachmentSchema, input);
    const dir = resolveDownloadDir();

    const { attachment } = await redmineClient.getAttachment(id);
    // ponytail: holds the whole file in memory, stream it if attachments outgrow that.
    const content = await redmineClient.downloadAttachment(id, attachment.filename);

    // Catches saving something else, such as a login page reached through a redirect.
    if (content.length !== attachment.filesize) {
      throw new Error(
        `Downloaded ${content.length} bytes but attachment #${id} is ${attachment.filesize} bytes; nothing was saved`
      );
    }

    // The filename comes from the server, so it must not be able to leave the folder.
    const filePath = path.join(dir, `${id}-${attachment.filename.replace(/[/\\\p{Cc}]/gu, '_')}`);
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    // Attachment content is untrusted: 'wx' never replaces a file or follows a symlink,
    // and the mode keeps it private and non-executable.
    await fs.promises.writeFile(filePath, content, { flag: 'wx', mode: 0o600 });

    return {
      content: [{
        type: 'text',
        text: `Attachment #${id} saved.\nPath: ${filePath}\nFilename: ${attachment.filename}\nSize: ${content.length} bytes\nType: ${attachment.content_type ?? 'unknown'}`,
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true,
    };
  }
}

// Update attachment tool
export const updateAttachmentTool: Tool = {
  name: 'redmine_update_attachment',
  description: 'Update an existing attachment (filename or description)',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'Attachment ID to update',
      },
      filename: {
        type: 'string',
        description: 'New filename',
      },
      description: {
        type: 'string',
        description: 'New description',
      },
    },
    required: ['id'],
  },
};

export async function updateAttachment(input: unknown) {
  try {
    const { id, ...updateData } = input as { id: number; [key: string]: unknown };
    const attachmentId = parseId(id);
    const validatedData = validateInput(updateAttachmentSchema, updateData);

    await redmineClient.updateAttachment(attachmentId, validatedData);

    return {
      content: [{ type: 'text', text: `Attachment #${attachmentId} updated successfully.` }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true,
    };
  }
}

// Delete attachment tool
export const deleteAttachmentTool: Tool = {
  name: 'redmine_delete_attachment',
  description: 'Delete an attachment from Redmine',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'Attachment ID to delete',
      },
    },
    required: ['id'],
  },
};

export async function deleteAttachment(input: unknown) {
  try {
    const { id } = input as { id: number };
    const attachmentId = parseId(id);

    await redmineClient.deleteAttachment(attachmentId);

    return {
      content: [{ type: 'text', text: `Attachment #${attachmentId} deleted successfully.` }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorResponse(error) }],
      isError: true,
    };
  }
}
