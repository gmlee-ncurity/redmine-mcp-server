# Redmine MCP Server - Desktop Extension (DXT)

A comprehensive Desktop Extension that provides AI assistants with direct access to Redmine project management systems through the Model Context Protocol (MCP).

## Quick Start

1. **Download and Install**: Install this DXT extension in your AI client
2. **Configure**: Provide your Redmine URL and authentication credentials
3. **Use**: Start managing your Redmine projects through natural language

## Configuration

### Required Settings

- **Redmine URL**: The full URL to your Redmine instance (e.g., `https://redmine.example.com`)
- **Authentication**: Either:
  - **API Key** (recommended): Your Redmine API key
  - **Username/Password**: Your Redmine login credentials

### Optional Settings

- **SSL Verification**: Whether to verify SSL certificates (default: true)
- **Request Timeout**: HTTP request timeout in milliseconds (default: 30000)
- **Log Level**: Logging verbosity (debug, info, warn, error - default: info)

## Features

### Issue Management
- List issues with advanced filtering
- View detailed issue information including history
- Create new issues with custom fields
- Update existing issues
- Delete issues

### Project Management
- Browse all accessible projects
- View project details and metadata
- Access project versions and milestones

### Time Tracking
- Log time entries for issues and projects
- View and manage existing time entries
- List available time entry activities

### User Management
- View user profiles and memberships
- Get current user information
- Browse user lists with filters

### Wiki Management
- Create and edit wiki pages
- View wiki page content and history
- Manage wiki page hierarchies

### Utilities
- Search across issues, wiki pages, and content
- List available statuses, priorities, and trackers
- Make custom API requests for advanced use cases

## Example Queries

Once configured, you can interact with your Redmine instance using natural language:

- "Show me all open issues assigned to me"
- "Create a new bug report for the API project with high priority"
- "Log 2 hours of development work on issue #123"
- "What projects do I have access to?"
- "Show me the deployment wiki page"
- "What issues were updated this week?"
- "Update issue #456 to mark it as resolved"

## Security Considerations

- **API Keys**: Store API keys securely in the extension configuration
- **HTTPS**: Always use HTTPS for your Redmine URL in production
- **Permissions**: The extension will have the same permissions as your user account
- **Credentials**: Sensitive information is handled securely by the MCP protocol

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify your Redmine URL is correct and accessible
   - Check that the Redmine REST API is enabled
   - Ensure your credentials are valid

2. **Permission Denied**
   - Verify your API key or username/password are correct
   - Check that your user account has the necessary permissions
   - Ensure your account is active

3. **SSL Errors**
   - For self-signed certificates, set SSL verification to false (not recommended for production)
   - Ensure your Redmine instance has a valid SSL certificate

### Debug Mode

Enable debug logging by setting the log level to "debug" in the configuration. This will provide detailed information about:
- API requests and responses
- Tool execution timing
- Detailed error messages and stack traces

### Performance Tips

- Use specific filters when listing issues to reduce response times
- Consider increasing the request timeout for large Redmine instances
- Use pagination for large result sets

## Development

This extension is built using:
- **Node.js 20+**: Runtime environment
- **TypeScript**: Type-safe development
- **MCP SDK**: Model Context Protocol implementation
- **Axios**: HTTP client with retry logic
- **Zod**: Input validation and configuration

## Support

For issues, questions, or contributions:
- Check the main project documentation
- Review the API documentation for detailed tool specifications
- Enable debug logging for troubleshooting

## License

Apache License 2.0 - See LICENSE file for details