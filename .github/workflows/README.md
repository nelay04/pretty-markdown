# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the Pretty Markdown extension.

## Deploy to VS Code Marketplace

The `deploy-marketplace.yml` workflow allows you to deploy the extension to the VS Code Marketplace with a manual trigger.

### Setup Required

Before using this workflow, you need to set up the following secrets in your GitHub repository:

1. **VSCE_PAT** - Visual Studio Code Extension Personal Access Token
   - Go to [Azure DevOps](https://dev.azure.com/)
   - Create a Personal Access Token with **Marketplace: Manage** scope
   - Add this token as a repository secret named `VSCE_PAT`

### How to Use

1. Go to your GitHub repository
2. Navigate to **Actions** tab
3. Select **Deploy to VS Code Marketplace** workflow
4. Click **Run workflow**
5. Choose the version bump type:
   - `patch` - for bug fixes (1.0.0 → 1.0.1)
   - `minor` - for new features (1.0.0 → 1.1.0)
   - `major` - for breaking changes (1.0.0 → 2.0.0)
   - `skip` - deploy current version without bumping
6. Optionally add release notes
7. Click **Run workflow**

### What the Workflow Does

1. **Quality Checks**
   - Runs linting
   - Performs type checking
   - Executes tests

2. **Version Management**
   - Bumps version in package.json (if requested)
   - Creates a Git tag
   - Commits changes back to main branch

3. **Publishing**
   - Builds and packages the extension
   - Publishes to VS Code Marketplace
   - Creates a GitHub release
   - Uploads the .vsix file as a release asset

4. **Cleanup**
   - Pushes version changes to repository
   - Creates detailed summary

### Security Notes

- The workflow only runs on manual trigger for security
- Requires proper PAT configuration
- Only runs from the main branch
- All secrets are properly masked in logs

### Troubleshooting

If the workflow fails:
1. Check that `VSCE_PAT` secret is properly set
2. Ensure the token has correct permissions
3. Verify all tests pass locally
4. Check workflow logs for specific error messages