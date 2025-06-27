import { AxiosError } from 'axios';

export class RedmineError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errors?: string[]
  ) {
    super(message);
    this.name = 'RedmineError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function handleAxiosError(error: AxiosError): never {
  if (error.response) {
    // Server responded with error status
    const statusCode = error.response.status;
    const data = error.response.data as any;
    
    let message = `Redmine API error (${statusCode})`;
    
    if (data?.errors) {
      const errors = Array.isArray(data.errors) ? data.errors : [data.errors];
      message = `${message}: ${errors.join(', ')}`;
    } else if (data?.error) {
      message = `${message}: ${data.error}`;
    } else if (typeof data === 'string') {
      message = `${message}: ${data}`;
    }
    
    throw new RedmineError(message, statusCode);
  } else if (error.request) {
    // Request made but no response received
    throw new RedmineError(
      'No response from Redmine server. Please check the server URL and network connection.'
    );
  } else {
    // Error setting up the request
    throw new RedmineError(`Request setup error: ${error.message}`);
  }
}

export function formatErrorResponse(error: unknown): string {
  if (error instanceof RedmineError) {
    return error.message;
  } else if (error instanceof ConfigurationError) {
    return `Configuration error: ${error.message}`;
  } else if (error instanceof ValidationError) {
    return `Validation error${error.field ? ` (${error.field})` : ''}: ${error.message}`;
  } else if (error instanceof Error) {
    return `Error: ${error.message}`;
  } else {
    return 'An unknown error occurred';
  }
}