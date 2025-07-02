# Redmine MCP Server - Installation Guide

## Desktop Extension (DXT) Installation

### Prerequisites

- AI client that supports Desktop Extensions (DXT)
- Redmine instance with REST API enabled
- Valid Redmine credentials (API key or username/password)

### Installation Steps

1. **Download the Extension**
   - Download the `redmine-mcp-server.dxt` file
   - Or clone this repository and build it yourself

2. **Install in Your AI Client**
   - Follow your AI client's extension installation process
   - Usually involves importing the `.dxt` file

3. **Configure the Extension**
   - Provide your Redmine URL (e.g., `https://redmine.example.com`)
   - Add authentication credentials:
     - **Option A (Recommended)**: API Key
     - **Option B**: Username and Password

4. **Optional Configuration**
   - SSL Verification: Enable/disable SSL certificate validation
   - Request Timeout: Adjust HTTP timeout (default: 30 seconds)
   - Log Level: Set logging verbosity (info, debug, warn, error)

### Getting Your Redmine API Key

1. Log into your Redmine instance
2. Go to "My Account" (usually top-right corner)
3. Click "API access key" in the sidebar
4. Click "Show" to reveal your API key
5. Copy the key to the extension configuration

### Verification

After installation, test the extension by asking:
- "What projects do I have access to?"
- "Show me my open issues"
- "What is my user information?"

### Troubleshooting

**Connection Issues:**
- Verify Redmine URL is correct and accessible
- Check that REST API is enabled in Redmine admin settings
- Ensure firewall/network allows access

**Authentication Issues:**
- Verify API key is valid and not expired
- Check username/password if using basic auth
- Ensure user account is active and has proper permissions

**SSL Issues:**
- For development/testing: Disable SSL verification
- For production: Ensure valid SSL certificate
- Check if custom CA certificate is needed

### Security Notes

- API keys are stored securely by the extension
- Always use HTTPS for production Redmine instances
- Extension operates with your user permissions
- No data is sent to external services

## Manual Installation (Development)

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn package manager

### Steps

1. **Clone Repository**
   ```bash
   git clone https://github.com/your-org/mcp-server-redmine.git
   cd redmine-mcp-server
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build Project**
   ```bash
   npm run build
   ```

4. **Configure Environment**
   ```bash
   export REDMINE_URL="https://your-redmine-instance.com"
   export REDMINE_API_KEY="your-api-key"
   ```

5. **Test Installation**
   ```bash
   npm test
   npm run validate-dxt
   ```

6. **Run Server**
   ```bash
   npm start
   ```

### Building DXT Package

1. **Validate Package**
   ```bash
   npm run validate-dxt
   ```

2. **Create DXT Package**
   ```bash
   # Using dxt CLI tool
   dxt pack .
   ```

3. **Test Package**
   ```bash
   node scripts/test-dxt.js
   ```

## Configuration Reference

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `REDMINE_URL` | Redmine instance URL | Yes | - |
| `REDMINE_API_KEY` | API key for authentication | No* | - |
| `REDMINE_USERNAME` | Username for basic auth | No* | - |
| `REDMINE_PASSWORD` | Password for basic auth | No* | - |
| `REDMINE_SSL_VERIFY` | Verify SSL certificates | No | true |
| `REDMINE_REQUEST_TIMEOUT` | HTTP timeout (ms) | No | 30000 |
| `LOG_LEVEL` | Logging level | No | info |

*Either API key or username/password required

### Manifest Configuration

The `manifest.json` file contains:
- Extension metadata and version
- Tool definitions and descriptions
- User configuration schema
- Server execution parameters
- Platform compatibility requirements

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the API documentation
- Enable debug logging for detailed information
- Check Redmine server logs for API-related issues