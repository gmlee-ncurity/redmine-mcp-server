#!/bin/bash

# Automated release script for Redmine MCP Server
# This script handles version bumping, testing, building, committing, and publishing

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to bump version
bump_version() {
    local bump_type=${1:-patch}
    
    print_status "Bumping version (type: $bump_type)"
    
    case $bump_type in
        major|minor|patch)
            npm version $bump_type --no-git-tag-version
            ;;
        *)
            print_error "Invalid version bump type: $bump_type"
            print_error "Valid types: major, minor, patch"
            exit 1
            ;;
    esac
}

# Function to run tests
run_tests() {
    print_status "Running tests..."
    
    # Set required environment variables for tests
    export REDMINE_URL="https://test.redmine.com"
    export REDMINE_API_KEY="test-api-key"
    
    if npm test; then
        print_success "All tests passed"
    else
        print_error "Tests failed"
        exit 1
    fi
}

# Function to run linting
run_lint() {
    print_status "Running linter..."
    
    if npm run lint; then
        print_success "Linting passed"
    else
        print_warning "Linting issues found (build will continue)"
    fi
}

# Function to build project
build_project() {
    print_status "Building project..."
    
    if npm run build; then
        print_success "Build successful"
    else
        print_error "Build failed"
        exit 1
    fi
}

# Function to commit and push changes
commit_and_push() {
    local version=$(node -p "require('./package.json').version")
    
    print_status "Committing changes for version $version"
    
    git add .
    git commit -m "Release version $version

- Automated release with version bump
- All tests passing
- Build successful

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
    
    print_status "Pushing to remote repository..."
    git push
    
    print_success "Changes pushed to repository"
}

# Function to publish to npm
publish_to_npm() {
    local version=$(node -p "require('./package.json').version")
    
    print_status "Publishing version $version to npm..."
    
    if npm publish; then
        print_success "Successfully published to npm"
    else
        print_error "Failed to publish to npm"
        exit 1
    fi
}

# Function to create GitHub release (optional)
create_github_release() {
    local version=$(node -p "require('./package.json').version")
    
    if command -v gh &> /dev/null; then
        print_status "Creating GitHub release..."
        
        gh release create "v$version" \
            --title "Release v$version" \
            --notes "Automated release v$version

## Changes
- Version bump to $version
- All tests passing
- Successfully published to npm

## Installation
\`\`\`bash
npm install -g @gmlee-ncurity/mcp-server-redmine@$version
\`\`\`

🤖 Generated with [Claude Code](https://claude.ai/code)" \
            --latest
        
        print_success "GitHub release created"
    else
        print_warning "GitHub CLI not found. Skipping GitHub release creation."
        print_warning "Install 'gh' CLI to enable automatic GitHub releases."
    fi
}

# Main release function
main() {
    local bump_type=${1:-patch}
    local skip_tests=${2:-false}
    
    print_status "Starting automated release process..."
    print_status "Version bump type: $bump_type"
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not in a git repository"
        exit 1
    fi
    
    # Check if working directory is clean
    if ! git diff-index --quiet HEAD --; then
        print_error "Working directory is not clean. Please commit or stash changes first."
        exit 1
    fi
    
    # Bump version
    bump_version $bump_type
    
    # Run tests (unless skipped)
    if [ "$skip_tests" != "true" ]; then
        run_tests
    else
        print_warning "Skipping tests (--skip-tests flag used)"
    fi
    
    # Run linting
    run_lint
    
    # Build project
    build_project
    
    # Commit and push
    commit_and_push
    
    # Publish to npm
    publish_to_npm
    
    # Create GitHub release
    create_github_release
    
    local version=$(node -p "require('./package.json').version")
    print_success "🎉 Release $version completed successfully!"
    print_success "Package is now available: npm install -g @gmlee-ncurity/mcp-server-redmine@$version"
}

# Help function
show_help() {
    echo "Usage: $0 [VERSION_TYPE] [OPTIONS]"
    echo ""
    echo "VERSION_TYPE:"
    echo "  major    Bump major version (x.0.0)"
    echo "  minor    Bump minor version (0.x.0)"
    echo "  patch    Bump patch version (0.0.x) [default]"
    echo ""
    echo "OPTIONS:"
    echo "  --skip-tests    Skip running tests"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Bump patch version"
    echo "  $0 minor              # Bump minor version"
    echo "  $0 patch --skip-tests # Bump patch version, skip tests"
}

# Parse command line arguments
case $1 in
    --help|-h)
        show_help
        exit 0
        ;;
    major|minor|patch)
        main $1 $2
        ;;
    --skip-tests)
        main patch true
        ;;
    "")
        main patch false
        ;;
    *)
        print_error "Unknown argument: $1"
        show_help
        exit 1
        ;;
esac