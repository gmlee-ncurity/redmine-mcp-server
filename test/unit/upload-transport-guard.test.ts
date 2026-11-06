import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { uploadFile } from '../../src/tools/files.js';
import { downloadAttachment } from '../../src/tools/attachments.js';
import { redmineClient } from '../../src/client/index.js';

vi.mock('../../src/client/index.js', () => ({
  redmineClient: { uploadFile: vi.fn(), getAttachment: vi.fn(), downloadAttachment: vi.fn() },
}));

// file_path reads the *server's* filesystem. On streamable-http the server may be
// remote and multi-tenant, so the guard must refuse it there.
vi.mock('../../src/config.js', () => ({
  config: {
    redmine: {
      url: 'https://test.redmine.com',
      apiKey: 'test-api-key',
      sslVerify: true,
      requestTimeout: 30000,
      maxRetries: 3,
    },
    transport: { type: 'streamable-http', port: 3000, host: '127.0.0.1' },
    logging: { level: 'info', otelLevel: 'none' },
  },
}));

describe('uploadFile file_path guard', () => {
  it('should refuse file_path on the streamable-http transport', async () => {
    const result = await uploadFile({ file_path: '/etc/passwd' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('stdio');
    expect(redmineClient.uploadFile).not.toHaveBeenCalled();
  });

  it('should still accept content_base64 on the streamable-http transport', async () => {
    vi.mocked(redmineClient.uploadFile).mockResolvedValue({
      upload: { token: 'http-token' },
    });

    const result = await uploadFile({
      content_base64: Buffer.from('hi').toString('base64'),
      filename: 'hi.txt',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Token: http-token');
  });

  it('should refuse save_path on the streamable-http transport', async () => {
    const savePath = path.join(os.tmpdir(), `redmine-guard-${process.pid}.bin`);

    const result = await downloadAttachment({ id: 7, save_path: savePath });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('stdio');
    expect(redmineClient.getAttachment).not.toHaveBeenCalled();
    expect(redmineClient.downloadAttachment).not.toHaveBeenCalled();
    await expect(fs.promises.stat(savePath)).rejects.toThrow('ENOENT');
  });
});
