# Installing Superdesign in Windsurf

This guide explains how to build and install the Superdesign extension from source code into Windsurf IDE.

## Prerequisites

- Node.js (v20.x or higher)
- npm
- Windsurf IDE installed

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Extension

```bash
npm run package
```

This command will:
- Check TypeScript types
- Run ESLint
- Build the extension for production

### 3. Package as VSIX

```bash
npx vsce package
```

This will create a `.vsix` file (e.g., `superdesign-0.0.6.vsix`) in the project directory.

### 4. Install in Windsurf/VS Code

#### Option A: Using Command Line (Recommended)

```bash
code --install-extension superdesign-0.0.6.vsix
```

Or for VS Code Server:

```bash
code-server --install-extension superdesign-0.0.6.vsix
```

For remote VS Code Server installations, you may need to use the full path:

```bash
~/.vscode-server/cli/servers/Stable-*/server/bin/code-server --install-extension /path/to/superdesign-0.0.6.vsix
```

#### Option B: Using GUI

1. Open Windsurf IDE or VS Code
2. Open the Command Palette:
   - **macOS**: `Cmd+Shift+P`
   - **Windows/Linux**: `Ctrl+Shift+P`
3. Type: `Extensions: Install from VSIX...`
4. Navigate to and select the generated `.vsix` file
5. Click "Install"

## Verifying Installation

After installation, you should see:
- The Superdesign icon in the Activity Bar
- Access to Superdesign commands via the Command Palette (search for "Superdesign")

## Development Mode

For development, you can run the extension in watch mode:

```bash
npm run watch
```

Then use VS Code's "Run and Debug" feature to test the extension.

## Troubleshooting

If you encounter issues:
1. Ensure all dependencies are installed: `npm install`
2. Check for build errors: `npm run compile`
3. Verify the `.vsix` file was created successfully
4. Restart Windsurf after installation

## Note

Since Windsurf is based on VS Code, it uses the same extension format and installation process as VS Code extensions.