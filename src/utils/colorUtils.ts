/**
 * Color utility functions for palettes and gradients
 */

/**
 * Interpolate between two hex colors
 */
export function interpolateColor(color1: string, color2: string, factor: number): string {
	const c1 = hexToRgb(color1);
	const c2 = hexToRgb(color2);
	
	if (!c1 || !c2) return color1;
	
	const r = Math.round(c1.r + (c2.r - c1.r) * factor);
	const g = Math.round(c1.g + (c2.g - c1.g) * factor);
	const b = Math.round(c1.b + (c2.b - c1.b) * factor);
	
	return rgbToHex(r, g, b);
}

/**
 * Convert hex to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
	return '#' + [r, g, b].map(x => {
		const hex = x.toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	}).join('');
}

/**
 * Generate gradient colors between palette colors
 */
export function generateGradientColors(palette: string[], count: number): string[] {
	if (palette.length === 0) return [];
	if (palette.length === 1) return Array(count).fill(palette[0]);
	if (count <= palette.length) return palette.slice(0, count);
	
	const colors: string[] = [];
	const segments = palette.length - 1;
	
	for (let i = 0; i < count; i++) {
		const position = i / (count - 1);
		const segmentIndex = Math.min(Math.floor(position * segments), segments - 1);
		const segmentStart = segmentIndex / segments;
		const segmentEnd = (segmentIndex + 1) / segments;
		const segmentFactor = (position - segmentStart) / (segmentEnd - segmentStart);
		
		const color1 = palette[segmentIndex];
		const color2 = palette[segmentIndex + 1];
		colors.push(interpolateColor(color1, color2, segmentFactor));
	}
	
	return colors;
}

/**
 * Generate repeating colors from palette
 */
export function generateRepeatingColors(palette: string[], count: number): string[] {
	if (palette.length === 0) return [];
	
	const colors: string[] = [];
	for (let i = 0; i < count; i++) {
		colors.push(palette[i % palette.length]);
	}
	
	return colors;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / d + 2) / 6; break;
			case b: h = ((r - g) / d + 4) / 6; break;
		}
	}

	return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	h = h / 360;
	s = s / 100;
	l = l / 100;

	let r: number, g: number, b: number;

	if (s === 0) {
		r = g = b = l;
	} else {
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;

		r = hue2rgb(p, q, h + 1/3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1/3);
	}

	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255)
	};
}

/**
 * Apply HSL transformation to a color
 */
export function applyHSLTransformation(hex: string, transformation: { hue?: number; saturation?: number; lightness?: number }): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;

	let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

	// Apply transformations
	if (transformation.hue !== undefined) {
		h = (h + transformation.hue + 360) % 360;
	}
	if (transformation.saturation !== undefined) {
		s = Math.max(0, Math.min(100, s + transformation.saturation));
	}
	if (transformation.lightness !== undefined) {
		l = Math.max(0, Math.min(100, l + transformation.lightness));
	}

	const newRgb = hslToRgb(h, s, l);
	return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

/**
 * Apply lightness transformation to a color
 */
export function applyLightnessTransformation(hex: string, adjustment: number): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;

	const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
	const newL = Math.max(0, Math.min(100, l + adjustment));
	const newRgb = hslToRgb(h, s, newL);
	return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

/**
 * Get hue value from hex color
 */
export function getHueFromHex(hex: string): number {
	const rgb = hexToRgb(hex);
	if (!rgb) return 0;
	
	const { h } = rgbToHsl(rgb.r, rgb.g, rgb.b);
	return Math.round(h);
}

/**
 * Converts hex color to CSS filter for coloring images
 * This uses a simplified approach - for better results, prefer SVG icons
 */
export function getColorFilter(hex: string): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return '';
	
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	
	// Convert to grayscale first, then apply color
	const brightness = (r + g + b) / 3;
	const hue = getHueFromHex(hex);
	
	// Return a filter that makes the image use the specified color
	return `brightness(0) saturate(100%) invert(${Math.round(brightness * 100)}%) sepia(100%) saturate(10000%) hue-rotate(${hue}deg)`;
}

