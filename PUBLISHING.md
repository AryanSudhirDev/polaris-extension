# Publishing Guide

This guide explains how to publish the Promptr extension to both the VS Code Marketplace and Open VSX Registry.

## Prerequisites

1. **VS Code Marketplace** - Microsoft account with publisher access
2. **Open VSX Registry** - Account at [open-vsx.org](https://open-vsx.org)

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs both `vsce` (VS Code Marketplace) and `ovsx` (Open VSX Registry) CLI tools.

### 2. Get Access Tokens

**VS Code Marketplace:**
1. Go to [Azure DevOps](https://dev.azure.com)
2. Create a Personal Access Token (PAT) with **Marketplace (Publish)** scope
3. Login: `vsce login <publisher-name>`

**Open VSX Registry:**
1. Go to [open-vsx.org](https://open-vsx.org)
2. Sign in with GitHub
3. Go to Settings → Access Tokens
4. Create a new token
5. Save it securely

## Publishing

### Option 1: Publish to Both Registries

```bash
# Set Open VSX token as environment variable
export OVSX_PAT=<your-open-vsx-token>

# Publish to both registries
npm run publish:all
```

### Option 2: Publish Individually

**VS Code Marketplace only:**
```bash
npm run publish:vsce
```

**Open VSX Registry only:**
```bash
# Set token
export OVSX_PAT=<your-open-vsx-token>

# Publish
npm run publish:ovsx
```

### Option 3: Manual VSIX Upload

1. **Package the extension:**
   ```bash
   npm run package
   ```
   This creates `promptr-<version>.vsix`

2. **Upload to VS Code Marketplace:**
   - Go to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
   - Click your publisher
   - Click **New Extension** → **Upload extension**
   - Select the `.vsix` file

3. **Upload to Open VSX:**
   ```bash
   npx ovsx publish promptr-<version>.vsix -p <your-token>
   ```
   
   Or via web interface at [open-vsx.org/user-settings/namespaces](https://open-vsx.org/user-settings/namespaces)

## Version Bumping

Before publishing a new version:

1. Update version in `package.json`:
   ```json
   "version": "1.5.2"
   ```

2. Update `CHANGELOG.md` with changes

3. Commit changes:
   ```bash
   git add .
   git commit -m "v1.5.2: <description>"
   git tag v1.5.2
   git push && git push --tags
   ```

4. Publish:
   ```bash
   npm run publish:all
   ```

## Where Will It Show Up?

### VS Code Marketplace
- **Official VS Code** - Extensions sidebar
- **URL:** `https://marketplace.visualstudio.com/items?itemName=aryansudhir.promptr`

### Open VSX Registry
- **VSCodium** - Extensions sidebar
- **Gitpod** - Extensions view
- **Eclipse Theia** - Extensions view
- **Code-OSS** - Extensions sidebar
- **Any VS Code fork** that uses Open VSX
- **URL:** `https://open-vsx.org/extension/aryansudhir/promptr`

## Notes

- **Open VSX** is the open-source alternative to VS Code Marketplace
- Many open-source VS Code distributions use Open VSX instead of Microsoft's Marketplace
- Publishing to both ensures maximum reach
- Open VSX has [API compatibility](https://github.com/eclipse/openvsx/wiki/Using-Open-VSX-in-VS-Code) with VS Code Marketplace

## Troubleshooting

### "Publisher not found" error
Create a namespace on Open VSX matching your publisher name.

### "Extension already exists"
You need to be added as a maintainer for the namespace on Open VSX.

### Version conflicts
Ensure `package.json` version doesn't conflict with already published versions.

## Resources

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Open VSX Publishing Guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)
- [Open VSX Wiki](https://github.com/eclipse/openvsx/wiki)

