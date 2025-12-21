import { IconocolorSettings } from './types';

export const DEFAULT_SETTINGS: IconocolorSettings = {
	folderConfigs: {},
	iconSize: 20, // Default 16px icon size
	colorPalettes: [
		{
			name: 'Vibrant',
			// Rainbow colors: HSL(0-360, 100%, 50%) - full saturation, medium lightness
			colors: ['#FF0000', '#FF8000', '#FFFF00', '#80FF00', '#00FF00', '#00FF80', '#00FFFF', '#0080FF', '#0000FF', '#8000FF', '#FF00FF', '#FF0080']
		},
		{
			name: 'Pastel',
			// Soft colors: HSL(0-360, 50%, 85%) - medium saturation, high lightness
			colors: ['#FFB3B3', '#FFD4B3', '#FFF4B3', '#D4FFB3', '#B3FFB3', '#B3FFD4', '#B3FFF4', '#B3D4FF', '#B3B3FF', '#D4B3FF', '#F4B3FF', '#FFB3D4']
		},
		{
			name: 'Earth',
			// Muted earth tones: HSL(20-60, 40%, 45%) - medium saturation, medium-low lightness
			colors: ['#8B6B4A', '#8B7A4A', '#8B8B4A', '#7A8B4A', '#6B8B4A', '#5A8B5A', '#4A8B6B', '#4A7A8B', '#4A6B8B', '#5A5A8B', '#6B4A8B', '#7A4A8B']
		},
		{
			name: 'Cool',
			// Cool blues/cyans: HSL(180-240, 70%, 55%) - high saturation, medium lightness
			colors: ['#4ACCCC', '#4AB8CC', '#4AA3CC', '#4A8FCC', '#4A7ACC', '#4A66CC', '#4A52CC', '#4A3DCC', '#4A29CC', '#4A14CC']
		},
		{
			name: 'Warm',
			// Warm reds/oranges: HSL(0-60, 70%, 55%) - high saturation, medium lightness
			colors: ['#CC4A4A', '#CC5A4A', '#CC6A4A', '#CC7A4A', '#CC8A4A', '#CC9A4A', '#CCAA4A', '#CCBA4A', '#CCCA4A', '#CCDA4A']
		},
		{
			name: 'Muted',
			// Desaturated colors: HSL(0-360, 30%, 50%) - low saturation, medium lightness
			colors: ['#B38080', '#B38A80', '#B39480', '#B39E80', '#B3A880', '#B3B280', '#A8B380', '#9EB380', '#94B380', '#8AB380', '#80B380', '#80B38A']
		}
	],
	activePaletteIndex: 0,
	autoColorEnabled: false, // Whether to automatically assign base colors to root folders
	autoColorMode: 'gradient', // How to apply colors to root folders
	// Global transformations: how element colors are derived from base color
	iconColorTransformation: { type: 'none' }, // Icon color same as base by default
	folderColorTransformation: { type: 'none' }, // Background color same as base by default
	textColorTransformation: { type: 'lightness', adjustment: 20 }, // Text 20% lighter than base by default
	// Child base transformation: how child folders get base color from parent
	childBaseTransformation: {
		type: 'lightness',
		adjustment: 10, // Child base 10% lighter than parent by default
		useGradient: false, // Whether to interpolate between parent and next sibling
		backgroundOpacity: 100
	},
	folderColorOpacity: 0, // Global opacity for folder background colors (0-100, default 100)
	defaultIconRules: [], // Rules for applying default icons based on regex patterns
	// Profile management
	profiles: [], // Saved profiles
	activeProfileId: undefined, // Currently active profile ID (if any)
};

