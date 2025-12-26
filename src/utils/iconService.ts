/**
 * Icon service for managing Lucide and SimpleIcons
 * Based on obsidian-iconize approach
 */

import { App, getIconIds, TFile, setIcon } from 'obsidian';
import { setCssProps } from './domUtils';

export interface IconInfo {
	name: string;
	displayName: string;
	source: 'lucide' | 'simpleicons' | 'custom' | 'local' | 'pack';
	svg?: string;
	url?: string;
	path?: string; // Local file path for downloaded icons
	iconPackName?: string; // Name of the icon pack
}

// Cache for icon lists - keyed by app instance
const iconCache = new WeakMap<App, { icons: IconInfo[]; timestamp: number }>();
// Cache for native Lucide icons (they don't change, so cache indefinitely)
const nativeLucideIconsCache = new WeakMap<App, IconInfo[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the icon cache (call this when icon packs are added/removed)
 */
export function clearIconCache(app?: App): void {
	if (app) {
		// Clear cache for specific app instance
		iconCache.delete(app);
		nativeLucideIconsCache.delete(app);
	} else {
		// WeakMap doesn't have clear(), so we can't clear all
		// The cache will naturally expire on next access
		// For a more aggressive clear, we'd need to track app instances separately
	}
}

/**
 * Get Lucide icon SVG URL (Obsidian uses these internally)
 * For Lucide icons, we'll use the icon name and let Obsidian render it
 */
export function getLucideIconUrl(iconName: string): string {
	// Obsidian has Lucide built-in, so we'll use a special prefix
	return `lucide:${iconName}`;
}


/**
 * Get native Lucide icons from Obsidian (cached)
 */
function getNativeLucideIcons(app: App): IconInfo[] {
	// Check cache first
	if (nativeLucideIconsCache.has(app)) {
		return nativeLucideIconsCache.get(app)!;
	}
	
	const icons: IconInfo[] = [];
	
	try {
		const iconIds = getIconIds();
		if (!iconIds || iconIds.length === 0) {
			console.warn('[Iconocolor] getIconIds() returned empty or undefined');
			nativeLucideIconsCache.set(app, []);
			return [];
		}
		
		const lucideIconIds = iconIds.filter((id: string) => id && id.startsWith('lucide-'));
		
		lucideIconIds.forEach((iconId: string) => {
			const iconName = iconId.replace(/^lucide-/, '');
			icons.push({
				name: iconName,
				displayName: iconName,
				source: 'lucide',
				url: getLucideIconUrl(iconName),
			});
		});
		
		// Sort and cache
		const sortedIcons = icons.sort((a, b) => a.name.localeCompare(b.name));
		nativeLucideIconsCache.set(app, sortedIcons);
		
		
		return sortedIcons;
	} catch (error) {
		console.error('[Iconocolor] Could not get native Lucide icons:', error);
		nativeLucideIconsCache.set(app, []);
		return [];
	}
}

/**
 * Get all icons from all installed packs - using obsidian-iconize approach
 * Recursively traverses folders to find all SVG files
 * Results are cached to avoid repeated file system scans
 * Also includes native Lucide icons in the cache
 */
export async function getAllIconsFromPacks(app: App, forceRefresh: boolean = false): Promise<IconInfo[]> {
		// Check cache first
		const now = Date.now();
		if (!forceRefresh && iconCache.has(app)) {
			const cached = iconCache.get(app);
			if (cached && (now - cached.timestamp < CACHE_DURATION)) {
				// Cache is still valid
				return cached.icons;
			}
		}
	
	const icons: IconInfo[] = [];
	
	try {
		const configDir = app.vault.configDir;
		const iconsPath = `${configDir}/icons`;
		
		// Check if icons folder exists
		if (!(await app.vault.adapter.exists(iconsPath))) {
			// Even if no icons folder, include native Lucide icons
			const nativeLucide = getNativeLucideIcons(app);
			const allIcons = [...nativeLucide];
			iconCache.set(app, { icons: allIcons, timestamp: now });
			return allIcons;
		}
		
		// Recursively get all files from all folders
		const processFolder = async (folderPath: string): Promise<void> => {
			try {
				const listResult = await app.vault.adapter.list(folderPath);
				
				// Process all SVG files in this folder
				for (const filePath of listResult.files) {
					if (filePath.endsWith('.svg')) {
						// Extract icon pack name from path
						const relativePath = filePath.replace(iconsPath + '/', '');
						const pathParts = relativePath.split('/');
						const iconPackName = pathParts.length > 1 ? pathParts[0] : null;
						const fileName = pathParts[pathParts.length - 1];
						const iconName = fileName.replace('.svg', '');
						
						// Determine source based on pack name or folder path
						let source: 'lucide' | 'simpleicons' | 'local' | 'pack' = 'local';
						if (iconPackName) {
							const packNameLower = iconPackName.toLowerCase();
							// Check for various Lucide pack name variations
							if (packNameLower === 'lucide' || packNameLower === 'lucide-icons' || packNameLower === 'lucideicons' || packNameLower.includes('lucide')) {
								source = 'lucide';
							} else if (packNameLower === 'simple-icons' || packNameLower === 'simpleicons' || packNameLower === 'simple_icons' || packNameLower.includes('simpleicon')) {
								source = 'simpleicons';
							} else {
								source = 'pack';
							}
						} else {
							// Icon is in root icons folder - check if folder path contains pack name
							// This handles cases where folderPath might be something like '.obsidian/icons/simple-icons'
							const folderName = folderPath.split('/').pop() || '';
							const folderNameLower = folderName.toLowerCase();
							if (folderNameLower.includes('lucide')) {
								source = 'lucide';
							} else if (folderNameLower.includes('simpleicon') || folderNameLower.includes('simple-icon')) {
								source = 'simpleicons';
							}
						}
						
						icons.push({
							name: iconName,
							displayName: iconName,
							source: source,
							path: filePath,
							url: source === 'lucide' ? getLucideIconUrl(iconName) : undefined,
							iconPackName: iconPackName || folderPath.split('/').pop() || undefined,
						});
					}
				}
				
				// Recursively process subfolders (icon packs)
				for (const folder of listResult.folders) {
					await processFolder(folder);
				}
			} catch (error) {
				console.warn(`[Iconocolor] Failed to process folder ${folderPath}:`, error);
			}
		};
		
		// Start processing from the icons root folder
		await processFolder(iconsPath);
		
		// Get native Lucide icons and merge (avoiding duplicates)
		const nativeLucide = getNativeLucideIcons(app);
		const existingKeys = new Set<string>();
		
		// Create keys for existing icons (name + source + path)
		icons.forEach(icon => {
			const key = `${icon.name.toLowerCase()}-${icon.source}-${icon.path || icon.url || ''}`;
			existingKeys.add(key);
		});
		
		// Add native Lucide icons that aren't already in the list
		nativeLucide.forEach(icon => {
			const key = `${icon.name.toLowerCase()}-${icon.source}-${icon.path || icon.url || ''}`;
			if (!existingKeys.has(key)) {
				icons.push(icon);
				existingKeys.add(key);
			}
		});
		
		const sortedIcons = icons.sort((a, b) => a.name.localeCompare(b.name));
		
		// Cache the results (includes native Lucide icons)
		iconCache.set(app, { icons: sortedIcons, timestamp: now });
		
		
		return sortedIcons;
	} catch (error) {
		console.error('[Iconocolor] Failed to get icons from packs:', error);
		// Even on error, include native Lucide icons
		const nativeLucide = getNativeLucideIcons(app);
		iconCache.set(app, { icons: nativeLucide, timestamp: now });
		return nativeLucide;
	}
}

/**
 * Search icons by name - searches all local icons from all packs
 * Based on obsidian-iconize approach
 */
export async function searchIcons(
	query: string,
	source: 'lucide' | 'simpleicons' | 'all' | 'local' | 'custom' | string = 'all',
	app?: App
): Promise<IconInfo[]> {
	if (!app) {
		return [];
	}

	// Get all icons from all packs (this already includes native Lucide icons in the cache)
	const allIcons = await getAllIconsFromPacks(app);
	
	// Filter based on source
	let filteredIcons: IconInfo[] = [];

	if (source === 'all') {
		filteredIcons = allIcons;
	} else if (source === 'lucide') {
		// Filter for Lucide icons (includes native ones from cache)
		filteredIcons = allIcons.filter(icon => icon.source === 'lucide');
	} else if (source === 'simpleicons') {
		filteredIcons = allIcons.filter(icon => icon.source === 'simpleicons');
	} else if (source === 'local') {
		filteredIcons = allIcons.filter(icon => icon.source === 'local' || icon.source === 'pack');
	} else {
		// It's a specific icon pack ID - match by pack name or ID
		// Normalize both for comparison (remove hyphens, underscores, spaces)
		const normalize = (str: string) => str.toLowerCase().replace(/[-_\s]/g, '');
		const sourceNormalized = normalize(source);
		
		filteredIcons = allIcons.filter(icon => {
			if (!icon.iconPackName) return false;
			const packNameNormalized = normalize(icon.iconPackName);
			return packNameNormalized === sourceNormalized;
		});
	}

	// If query is empty, return all filtered icons
	const lowerQuery = query.toLowerCase().trim();
	if (!lowerQuery) {
		return filteredIcons;
	}

	// Search by name - use startsWith for better performance on large lists
	// Filter to icons that start with the query first (more relevant), then includes
	const startsWithMatches: IconInfo[] = [];
	const includesMatches: IconInfo[] = [];
	
	for (const icon of filteredIcons) {
		const nameLower = icon.name.toLowerCase();
		const displayLower = icon.displayName.toLowerCase();
		
		if (nameLower.startsWith(lowerQuery) || displayLower.startsWith(lowerQuery)) {
			startsWithMatches.push(icon);
		} else if (nameLower.includes(lowerQuery) || displayLower.includes(lowerQuery)) {
			includesMatches.push(icon);
		}
	}
	
	// Return startsWith matches first (more relevant), then includes matches
	return [...startsWithMatches, ...includesMatches];
}

/**
 * Check if an icon string is a Lucide icon reference
 */
export function isLucideIcon(icon: string): boolean {
	return icon.startsWith('lucide:');
}

/**
 * Get the icon name from a Lucide icon reference
 */
export function getLucideIconName(icon: string): string {
	if (isLucideIcon(icon)) {
		return icon.replace('lucide:', '');
	}
	return icon;
}

/**
 * Validate file path to prevent path traversal attacks
 */
function isValidFilePath(filePath: string): boolean {
	// Prevent path traversal
	if (filePath.includes('..')) {
		return false;
	}
	// Allow paths within vault (relative) or .obsidian folder
	// Paths starting with / are absolute (vault root)
	// Paths starting with .obsidian/ are in the .obsidian folder
	// Other relative paths are in the vault
	return true; // All paths are validated by Obsidian's vault API
}

/**
 * Load SVG content from a vault file and apply color to it
 * This removes hardcoded colors and applies the specified color
 * Works with both regular vault files and .obsidian folder files
 */
export async function loadSvgWithColor(
	app: App,
	filePath: string,
	color?: string
): Promise<string | null> {
	try {
		// Validate file path
		if (!isValidFilePath(filePath)) {
			console.warn(`[Iconocolor] Invalid file path: ${filePath}`);
			return null;
		}

		// Try using getAbstractFileByPath first (for regular vault files)
		let svgContent: string | null = null;
		
		try {
			const file = app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				svgContent = await app.vault.read(file);
			}
		} catch {
			// If getAbstractFileByPath fails (e.g., for .obsidian folder), try adapter directly
		}
		
		// If that didn't work, try reading directly via adapter (for .obsidian folder)
		if (!svgContent) {
			try {
				// Check if file exists (handle both sync and async exists)
				const existsResult = app.vault.adapter.exists(filePath);
				const exists = existsResult instanceof Promise ? await existsResult : existsResult;
				
				if (exists) {
					svgContent = await app.vault.adapter.read(filePath);
				} else {
					// File doesn't exist locally
					console.warn(`[Iconocolor] File does not exist: ${filePath}`);
					return null;
				}
			} catch (e) {
				console.error(`[Iconocolor] Failed to read file via adapter ${filePath}:`, e);
				return null;
			}
		}
		
		if (!svgContent) {
			return null;
		}
		
		// Parse and modify SVG to apply color
		return applyColorToSvg(svgContent, color);
	} catch (error) {
		console.error(`[Iconocolor] Failed to load SVG from ${filePath}:`, error);
		return null;
	}
}

/**
 * Apply color to SVG content by removing hardcoded colors and setting the specified color
 * Makes icons monochrome (currentColor/white) by default, then applies color if provided
 * This ensures all icons appear white/monochrome like Lucide icons
 */
export function applyColorToSvg(svgContent: string, color?: string): string {
	// Create a temporary DOM element to parse the SVG
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgContent, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	
	if (!svg) {
		return svgContent;
	}

	// Remove hardcoded fill and stroke attributes
	const removeColorAttributes = (element: Element) => {
		element.removeAttribute('fill');
		element.removeAttribute('stroke');
		
		// Also remove from style attribute if present
		const style = element.getAttribute('style');
		if (style) {
			const newStyle = style
				.replace(/fill:\s*[^;]+;?/gi, '')
				.replace(/stroke:\s*[^;]+;?/gi, '')
				.trim();
			if (newStyle) {
				element.setAttribute('style', newStyle);
			} else {
				element.removeAttribute('style');
			}
		}
	};

	// Check if it's a stroke-based icon (like Lucide) or fill-based
	// Look for stroke attributes or stroke-width in the SVG or its children
	// We need to check BEFORE removing attributes
	const allElements = Array.from(svg.querySelectorAll('*'));
	let hasStroke = false;
	
	// Check original attributes before removing them
	if (svg.getAttribute('stroke') || svg.getAttribute('stroke-width') || svg.style.stroke) {
		hasStroke = true;
	}
	
	// Check all child elements for stroke attributes
	allElements.forEach((el) => {
		if (el.getAttribute('stroke') || el.getAttribute('stroke-width') || (el as HTMLElement).style.stroke) {
			hasStroke = true;
		}
	});
	
	// Now remove color attributes
	allElements.forEach((el) => {
		removeColorAttributes(el);
	});
	removeColorAttributes(svg);

	// Default to currentColor (white/monochrome), then apply color if provided
	// This makes icons appear white by default, just like Lucide icons
	const finalColor = color || 'currentColor';
	
	if (hasStroke) {
		// Stroke-based icon (like Lucide) - use currentColor by default, then apply color
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', finalColor);
		setCssProps(svg, {
			fill: 'none',
			stroke: finalColor,
			color: finalColor,
		});
		
		allElements.forEach((el) => {
			el.setAttribute('fill', 'none');
			el.setAttribute('stroke', finalColor);
			setCssProps(el as HTMLElement, {
				fill: 'none',
				stroke: finalColor,
			});
		});
	} else {
		// Fill-based icon - use currentColor by default, then apply color
		svg.setAttribute('fill', finalColor);
		setCssProps(svg, {
			fill: finalColor,
			color: finalColor,
		});
		
		allElements.forEach((el) => {
			// Only set fill if element doesn't have stroke
			if (!el.getAttribute('stroke') && !el.getAttribute('stroke-width')) {
				el.setAttribute('fill', finalColor);
				setCssProps(el as HTMLElement, {
					fill: finalColor,
				});
			}
		});
	}

	// Serialize back to string
	const serializer = new XMLSerializer();
	return serializer.serializeToString(svg);
}


/**
 * Render an icon as an SVG element (unified rendering for all icon types)
 * Returns a div containing the SVG, styled consistently
 */
export function renderIconAsSvg(
	iconInfo: IconInfo | { name: string; displayName: string; source: 'lucide' | 'local' | 'pack' | 'simpleicons'; path?: string; url?: string },
	size: number,
	color?: string,
	app?: App
): Promise<HTMLElement> {
	return new Promise(async (resolve) => {
		const container = document.createElement('div');
		setCssProps(container, {
			width: `${size}px`,
			height: `${size}px`,
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			flexShrink: '0',
		});
		
		if (iconInfo.source === 'lucide') {
			// Use Obsidian's built-in setIcon for Lucide icons
			const iconDiv = document.createElement('div');
			setCssProps(iconDiv, {
				width: `${size}px`,
				height: `${size}px`,
			});
			setIcon(iconDiv, iconInfo.name);
			
			// Apply color to the SVG
			const svg = iconDiv.querySelector('svg');
			if (svg) {
				const finalColor = color || 'currentColor';
				setCssProps(svg, {
					color: finalColor,
					fill: 'none',
					stroke: finalColor,
				});
				svg.setAttribute('fill', 'none');
				svg.setAttribute('stroke', finalColor);
				
				// Apply to all path/line/polyline elements inside
				const paths = svg.querySelectorAll('path, line, polyline, circle, rect, ellipse');
				paths.forEach((path: Element) => {
					path.setAttribute('fill', 'none');
					path.setAttribute('stroke', finalColor);
					setCssProps(path as HTMLElement, {
						fill: 'none',
						stroke: finalColor,
					});
				});
			}
			
			container.appendChild(iconDiv);
			resolve(container);
		} else if (iconInfo.path && app) {
			// Load SVG content from local file (works for all pack icons: Tabler, SimpleIcons, etc.)
			const svgContent = await loadSvgWithColor(app, iconInfo.path, color);
			if (svgContent) {
				container.innerHTML = svgContent;
				const svg = container.querySelector('svg');
				if (svg) {
					setCssProps(svg, {
						width: `${size}px`,
						height: `${size}px`,
						color: color || 'currentColor',
					});
					if (!svg.hasAttribute('width')) {
						svg.setAttribute('width', `${size}`);
					}
					if (!svg.hasAttribute('height')) {
						svg.setAttribute('height', `${size}`);
					}
				}
			} else {
				// Icon loading failed - container will be empty, but caller should check for content
				console.debug(`[Iconocolor] Failed to load icon from ${iconInfo.path}`);
			}
			resolve(container);
		} else {
			// Fallback for other types
			resolve(container);
		}
	});
}
