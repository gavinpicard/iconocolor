export interface FolderConfig {
	icon?: string; // Path to icon file or icon name
	baseColor?: string; // Base color for this folder (used to derive other colors)
	iconColor?: string; // Explicit icon color (overrides transformation)
	folderColor?: string; // Explicit background color (overrides transformation)
	textColor?: string; // Explicit text color (overrides transformation)
	applyToSubfolders?: boolean; // Whether to apply to subfolders
	inheritBaseColor?: boolean; // Whether children inherit base color (default: true)
}

// Internal type for folder config with deletion flags
export interface FolderConfigWithDeletions extends FolderConfig {
	__deleteBaseColor?: boolean;
	__deleteIconColor?: boolean;
	__deleteFolderColor?: boolean;
	__deleteTextColor?: boolean;
}

export interface ColorPalette {
	name: string;
	colors: string[]; // Array of hex colors
}

export interface DefaultIconRule {
	id: string; // Unique identifier for the rule
	pattern: string; // Regex pattern to match file/folder names
	type: 'base' | 'markdown' | 'folder'; // Type of item to match
	icon: string; // Icon path or name (e.g., "lucide:file", "lucide:folder")
	iconColor?: string; // Optional icon color
	enabled: boolean; // Whether the rule is active
}

export interface HSLTransformation {
	type: 'hsl';
	hue?: number; // Hue shift in degrees (-180 to 180)
	saturation?: number; // Saturation adjustment in percentage (-100 to 100)
	lightness?: number; // Lightness adjustment in percentage (-100 to 100)
}

export interface LightnessTransformation {
	type: 'lightness';
	adjustment: number; // Percentage adjustment (-100 to 100, positive = lighter, negative = darker)
}

export interface NoTransformation {
	type: 'none';
}

export type ColorTransformation = HSLTransformation | LightnessTransformation | NoTransformation;

export interface ChildBaseTransformation {
	type: 'hsl' | 'lightness' | 'none';
	// HSL transformation
	hue?: number;
	saturation?: number;
	lightness?: number;
	// Lightness transformation
	adjustment?: number;
	// Gradient: interpolate between parent and next sibling before applying transformation
	useGradient?: boolean; // Whether to use gradient mode (automatically distributes across all children)
	// Background opacity (0-100, 0 = fully transparent, 100 = fully opaque)
	backgroundOpacity?: number;
}

export interface SettingsProfile {
	id: string; // Unique identifier
	name: string; // Display name
	// Profile contains a subset of settings (excluding folderConfigs which are per-folder)
	// Note: colorPalettes are NOT stored in profiles - they are global settings
	iconSize?: number;
	activePaletteIndex?: number;
	autoColorEnabled?: boolean;
	autoColorMode?: 'gradient' | 'repeat';
	iconColorTransformation?: ColorTransformation;
	folderColorTransformation?: ColorTransformation;
	textColorTransformation?: ColorTransformation;
	childBaseTransformation?: ChildBaseTransformation;
	folderColorOpacity?: number;
	defaultIconRules?: DefaultIconRule[];
}

export interface IconocolorSettings {
	folderConfigs: Record<string, FolderConfig>; // Map of folder path to config
	iconSize: number; // Global icon size in pixels
	colorPalettes: ColorPalette[]; // User-defined color palettes
	activePaletteIndex: number; // Index of currently active palette
	autoColorEnabled: boolean; // Whether to automatically assign base colors to root folders from palette
	autoColorMode: 'gradient' | 'repeat'; // How to apply colors to root folders
	// Global transformations: how to derive element colors from base color
	iconColorTransformation: ColorTransformation; // How icon color is derived from base
	folderColorTransformation: ColorTransformation; // How background color is derived from base
	textColorTransformation: ColorTransformation; // How text color is derived from base
	// Child base transformation: how child folders get their base color from parent
	childBaseTransformation: ChildBaseTransformation;
	folderColorOpacity: number; // Global opacity for folder background colors (0-100, default 100)
	defaultIconRules: DefaultIconRule[]; // Rules for applying default icons based on regex patterns
	// Profile management
	profiles: SettingsProfile[]; // Saved profiles
	activeProfileId?: string; // Currently active profile ID (if any)
}

