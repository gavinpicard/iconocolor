# Iconocolor

An all-in-one Obsidian plugin for customizing folder icons, icon colors, and folder colors in the file explorer.

## Features

- 🎨 **Folder Icons**: Add custom icons (SVG, PNG, or URLs) to any folder
- 🔍 **Icon Search**: Search and preview icons from Lucide (built-in) and SimpleIcons
- 🌈 **Icon Colors**: Customize the color of folder icons
- 🎨 **Folder Colors**: Set background and text colors for folders
- 📁 **Subfolder Support**: Optionally apply configurations to subfolders
- ⚙️ **Easy Configuration**: Right-click any folder to configure it

## Installation

### From Obsidian

1. Open Obsidian Settings
2. Navigate to **Community plugins** and disable Safe Mode
3. Click **Browse** and search for "Iconocolor"
4. Install the plugin
5. Enable the plugin in the **Community plugins** tab

### Manual Installation

1. Download the latest release
2. Extract the files to your vault's `.obsidian/plugins/iconocolor/` folder
3. Reload Obsidian
4. Enable the plugin in **Settings → Community plugins**

## Usage

### Setting Icons and Colors for a Folder

1. Right-click on any folder in the file explorer
2. Select **"Set icon and colors"**
3. In the icon picker:
   - **Lucide tab**: Search and browse built-in Lucide icons (Obsidian's native icon library)
   - **SimpleIcons tab**: Search and browse SimpleIcons (popular brand and technology icons)
   - **Custom tab**: Enter the path to an icon file (e.g., `/path/to/icon.svg`) or a URL
   - Optionally set an icon color (hex format like `#FF0000`)
   - Icons are displayed with live previews as you search
4. In the color picker:
   - Optionally set a folder background color
   - Optionally set a text color for the folder name
5. Choose whether to apply to subfolders
6. Click **Apply**

### Managing Configurations

- View all configured folders in **Settings → Iconocolor**
- Edit or remove configurations from the settings tab
- Right-click a configured folder and select **"Remove icon and colors"** to clear its configuration

## Icon Sources

The plugin supports multiple icon sources:

### Built-in Icon Libraries
- **Lucide Icons**: Built into Obsidian, no download required. Includes hundreds of icons like folder, file, home, settings, etc.
- **SimpleIcons**: Popular brand and technology icons (fetched from CDN). Includes icons for GitHub, Docker, JavaScript, React, and thousands more.

### Custom Icons
- **SVG files**: Best for icons as they can be colored easily
- **PNG/JPG files**: Supported but colorization may be limited
- **URLs**: Any web-accessible image URL
- **Local paths**: Paths relative to your vault or absolute paths

## Color Formats

All colors should be in hex format:
- `#FF0000` (red)
- `#00FF00` (green)
- `#0000FF` (blue)
- `#FFFFFF` (white)
- etc.

## Development

### Setup

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

This will watch for changes and automatically rebuild the plugin.

### Production Build

```bash
npm run build
```

## How It Works

The plugin:
1. Observes the file explorer DOM for changes
2. Applies custom styles and icons to folders based on your configuration
3. Stores all configurations in the plugin's data file
4. Supports inheritance from parent folders when "apply to subfolders" is enabled

## License

MIT

## Credits

Inspired by:
- [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) - For icon functionality
- [Color Folders and Files](https://github.com/Mithadon/obsidian-color-folders-files) - For color functionality
