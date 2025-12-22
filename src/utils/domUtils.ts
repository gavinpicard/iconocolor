import { FolderConfig } from '../types';
import { App, setIcon } from 'obsidian';
import { isLocalIcon } from './iconDownloader';
import { renderIconAsSvg, isLucideIcon, getLucideIconName, getLucideIconUrl } from './iconService';
import { getColorFilter } from './colorUtils';

/**
 * Convert hex color to rgba string with opacity
 */
function hexToRgba(hex: string, opacity: number): string {
	// Remove # if present
	hex = hex.replace('#', '');
	
	// Parse hex
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Applies icon and color styling to a folder element in the file explorer
 */
export function applyFolderStyles(
	element: HTMLElement,
	config: FolderConfig,
	pluginId: string,
	iconSize: number = 16,
	app?: App,
	folderColorOpacity: number = 100
): void {
	const folderName = element.querySelector('.nav-folder-title-content') as HTMLElement;
	const folderIcon = element.querySelector('.nav-folder-title-icon') as HTMLElement;
	
	if (!folderName) return;

	// Track current state to avoid unnecessary updates
	const hasConfig = config && (config.folderColor || config.textColor || config.icon);

	// Apply folder background color with opacity
	// We need to apply the class and CSS variable to the folder title element itself,
	// not the parent container, to avoid CSS cascading to child folders
	const folderTitle = element.querySelector('.nav-folder-title') as HTMLElement;
	if (config?.folderColor && folderTitle) {
		const opacity = folderColorOpacity / 100;
		const bgColor = hexToRgba(config.folderColor, opacity);
		const currentBg = folderTitle.style.getPropertyValue('--folder-bg-color');
		if (currentBg !== bgColor) {
			folderTitle.classList.add(`${pluginId}-styled-folder-title`);
			folderTitle.style.setProperty('--folder-bg-color', bgColor);
		}
	} else if (folderTitle) {
		// Only remove if it was previously set
		if (folderTitle.classList.contains(`${pluginId}-styled-folder-title`)) {
			folderTitle.classList.remove(`${pluginId}-styled-folder-title`);
			folderTitle.style.removeProperty('--folder-bg-color');
		}
	}

	// Apply text color directly to the folder name element
	if (config?.textColor) {
		const currentTextColor = folderName.style.color;
		if (currentTextColor !== config.textColor) {
			folderName.style.color = config.textColor;
		}
	} else {
		// Only remove if it was previously set (check if it's our custom color)
		const hasCustomColor = folderName.hasAttribute('data-iconocolor-text-color');
		if (hasCustomColor) {
			folderName.style.removeProperty('color');
			folderName.removeAttribute('data-iconocolor-text-color');
		}
	}

	// Mark that we set a text color
	if (config?.textColor) {
		folderName.setAttribute('data-iconocolor-text-color', 'true');
	}

	// Apply icon (only if config has an icon)
	if (config?.icon) {
		// Check if icon already exists and matches - avoid unnecessary re-rendering
		const existingIcon = folderName.querySelector(`.${pluginId}-custom-icon`) as HTMLElement;
		const existingIconData = existingIcon?.getAttribute('data-icon-path');
		const currentIconData = `${config.icon}|${config.iconColor || ''}`;
		
		// Check current icon size
		const currentIconSize = existingIcon?.style.getPropertyValue('--icon-size');
		const expectedIconSize = `${iconSize}px`;
		
		// Only update if icon changed OR size changed
		if (existingIconData === currentIconData && existingIcon && currentIconSize === expectedIconSize) {
			// Icon already exists and matches - just update color if needed
			if (config.iconColor !== undefined) {
				const svg = existingIcon.querySelector('svg');
				if (svg) {
					const finalColor = config.iconColor || 'currentColor';
					
					// Check if it's a stroke-based icon (like Lucide) or fill-based
					const hasStroke = svg.hasAttribute('stroke') || 
						svg.style.stroke || 
						svg.querySelector('path[stroke], line[stroke], polyline[stroke], circle[stroke], rect[stroke], ellipse[stroke]');
					
					if (hasStroke) {
						// Stroke-based icon
						svg.style.color = finalColor;
						svg.style.fill = 'none';
						svg.style.stroke = finalColor;
						svg.setAttribute('fill', 'none');
						svg.setAttribute('stroke', finalColor);
						
						const paths = svg.querySelectorAll('path, line, polyline, circle, rect, ellipse');
						paths.forEach((path: Element) => {
							path.setAttribute('fill', 'none');
							path.setAttribute('stroke', finalColor);
							(path as HTMLElement).style.fill = 'none';
							(path as HTMLElement).style.stroke = finalColor;
						});
					} else {
						// Fill-based icon
						svg.style.color = finalColor;
						svg.style.fill = finalColor;
						svg.setAttribute('fill', finalColor);
						
						const paths = svg.querySelectorAll('path, circle, rect, ellipse, polygon, polyline');
						paths.forEach((path: Element) => {
							// Only set fill if element doesn't have stroke
							if (!path.getAttribute('stroke') && !path.getAttribute('stroke-width')) {
								path.setAttribute('fill', finalColor);
								(path as HTMLElement).style.fill = finalColor;
							}
						});
					}
				}
			}
			return; // Icon already rendered correctly
		}
		
		// If icon exists but size changed, update the size
		if (existingIcon && existingIconData === currentIconData && currentIconSize !== expectedIconSize) {
			existingIcon.style.setProperty('--icon-size', expectedIconSize);
			// Update SVG/image size if present
			const svg = existingIcon.querySelector('svg');
			if (svg) {
				svg.style.width = expectedIconSize;
				svg.style.height = expectedIconSize;
				svg.setAttribute('width', String(iconSize));
				svg.setAttribute('height', String(iconSize));
			}
			const img = existingIcon.querySelector('img');
			if (img) {
				img.style.width = expectedIconSize;
				img.style.height = expectedIconSize;
			}
			// Also update the wrapper div if it exists
			const wrapper = existingIcon.querySelector('div[style*="width"]');
			if (wrapper) {
				(wrapper as HTMLElement).style.width = expectedIconSize;
				(wrapper as HTMLElement).style.height = expectedIconSize;
			}
			return; // Size updated, no need to recreate icon
		}

		// Remove ALL existing custom icons from folder title (including any that might be loading)
		const allExistingIcons = folderName.querySelectorAll(`.${pluginId}-custom-icon`);
		allExistingIcons.forEach(icon => icon.remove());

		// Also remove from folder icon area if it exists
		if (folderIcon) {
			const existingIconInIconArea = folderIcon.querySelectorAll(`.${pluginId}-custom-icon`);
			existingIconInIconArea.forEach(icon => icon.remove());
		}
		
		// Check if there's already a pending icon load (prevent duplicates from rapid calls)
		const pendingIconMarker = folderName.getAttribute('data-iconocolor-loading');
		if (pendingIconMarker === currentIconData) {
			// Icon is already being loaded with this exact config - skip
			return;
		}
		
		// Mark that we're loading this icon
		folderName.setAttribute('data-iconocolor-loading', currentIconData);

		// Create icon element container
		const iconEl = document.createElement('span');
		iconEl.className = `${pluginId}-custom-icon`;
		iconEl.style.setProperty('--icon-size', `${iconSize}px`);

		// Create IconInfo from config.icon
		let iconInfo: { name: string; displayName: string; source: 'lucide' | 'local' | 'pack' | 'simpleicons'; path?: string; url?: string } | null = null;
		
		if (isLucideIcon(config.icon)) {
			const iconName = getLucideIconName(config.icon);
			iconInfo = {
				name: iconName,
				displayName: iconName,
				source: 'lucide',
				url: getLucideIconUrl(iconName),
			};
		} else if (isLocalIcon(config.icon) && app) {
			iconInfo = {
				name: config.icon.split('/').pop()?.replace('.svg', '') || '',
				displayName: config.icon.split('/').pop() || '',
				source: 'local',
				path: config.icon,
			};
		}

		// Handle different icon types
		if (iconInfo && (iconInfo.source === 'lucide' || iconInfo.source === 'simpleicons' || iconInfo.source === 'local')) {
			// Lucide icons can be rendered synchronously (fast path)
			if (iconInfo.source === 'lucide' && app) {
				try {
					// Render Lucide icon synchronously using Obsidian's API
					const iconElement = document.createElement('div');
					iconElement.className = `${pluginId}-custom-icon`;
					iconElement.style.setProperty('--icon-size', `${iconSize}px`);
					iconElement.style.width = `${iconSize}px`;
					iconElement.style.height = `${iconSize}px`;
					iconElement.style.display = 'inline-flex';
					iconElement.style.alignItems = 'center';
					iconElement.style.justifyContent = 'center';
					iconElement.style.flexShrink = '0';
					
					// Use Obsidian's setIcon for Lucide icons (synchronous)
					setIcon(iconElement, iconInfo.name);
					
					// Apply color immediately
					const svg = iconElement.querySelector('svg');
					if (svg) {
						const finalColor = config.iconColor || 'currentColor';
						svg.style.color = finalColor;
						svg.style.fill = 'none';
						svg.style.stroke = finalColor;
						svg.setAttribute('fill', 'none');
						svg.setAttribute('stroke', finalColor);
						
						// Apply to all path/line/polyline elements inside
						const paths = svg.querySelectorAll('path, line, polyline, circle, rect, ellipse');
						paths.forEach((path: Element) => {
							path.setAttribute('fill', 'none');
							path.setAttribute('stroke', finalColor);
							(path as HTMLElement).style.fill = 'none';
							(path as HTMLElement).style.stroke = finalColor;
						});
					}
					
					iconElement.setAttribute('data-icon-path', currentIconData);
					folderName.removeAttribute('data-iconocolor-loading');
					
					// Insert icon immediately
					const textNode = Array.from(folderName.childNodes).find(node => 
						node.nodeType === Node.TEXT_NODE || 
						(node.nodeType === Node.ELEMENT_NODE && !(node as Element).classList.contains(`${pluginId}-custom-icon`))
					);
					
					if (textNode) {
						folderName.insertBefore(iconElement, textNode);
					} else {
						folderName.insertBefore(iconElement, folderName.firstChild);
					}
				} catch (error) {
					// Fallback to async if synchronous fails
					folderName.removeAttribute('data-iconocolor-loading');
					console.error(`[Iconocolor] Error loading Lucide icon ${config.icon}:`, error);
					// Don't continue - Lucide icons should always work via Obsidian API
					return;
				}
				// Success - icon inserted, return early
				return;
			} else {
				// For non-Lucide icons, load asynchronously but show placeholder immediately
				// Insert a placeholder div immediately so colors appear right away
				const placeholder = document.createElement('span');
				placeholder.className = `${pluginId}-custom-icon ${pluginId}-icon-placeholder`;
				placeholder.style.setProperty('--icon-size', `${iconSize}px`);
				placeholder.style.width = `${iconSize}px`;
				placeholder.style.height = `${iconSize}px`;
				placeholder.style.display = 'inline-flex';
				placeholder.style.flexShrink = '0';
				placeholder.setAttribute('data-icon-path', currentIconData);
				
				const textNode = Array.from(folderName.childNodes).find(node => 
					node.nodeType === Node.TEXT_NODE || 
					(node.nodeType === Node.ELEMENT_NODE && !(node as Element).classList.contains(`${pluginId}-custom-icon`))
				);
				
				if (textNode) {
					folderName.insertBefore(placeholder, textNode);
				} else {
					folderName.insertBefore(placeholder, folderName.firstChild);
				}
				
				// Load icon asynchronously, then replace placeholder
				(async () => {
					try {
						// Double-check we're still supposed to load this icon (might have been changed by another call)
						const stillLoading = folderName.getAttribute('data-iconocolor-loading') === currentIconData;
						if (!stillLoading) {
							placeholder.remove();
							return; // Another call changed the icon, abort
						}
						
						const iconElement = await renderIconAsSvg(iconInfo as any, iconSize, config.iconColor, app);
						
						// Check if iconElement actually has content (SVG or img) - don't insert empty containers
						const hasContent = iconElement.querySelector('svg') || iconElement.querySelector('img') || iconElement.innerHTML.trim().length > 0;
						if (!hasContent) {
							// Icon failed to load - remove placeholder and abort
							placeholder.remove();
							folderName.removeAttribute('data-iconocolor-loading');
							console.warn(`[Iconocolor] Icon element has no content for ${config.icon}`);
							return;
						}
						
						// Triple-check before inserting (icon might have changed during async load)
						const stillLoadingAfter = folderName.getAttribute('data-iconocolor-loading') === currentIconData;
						if (!stillLoadingAfter) {
							placeholder.remove();
							return; // Icon changed during load, abort
						}
						
						// Replace placeholder with actual icon
						iconElement.className = `${pluginId}-custom-icon`;
						iconElement.style.setProperty('--icon-size', `${iconSize}px`);
						iconElement.setAttribute('data-icon-path', currentIconData);
						
						// Clear loading marker
						folderName.removeAttribute('data-iconocolor-loading');
						
						// Replace placeholder
						if (placeholder.parentNode) {
							placeholder.parentNode.replaceChild(iconElement, placeholder);
						}
					} catch (error) {
						// Error loading icon - remove placeholder and clear loading marker
						placeholder.remove();
						folderName.removeAttribute('data-iconocolor-loading');
						console.error(`[Iconocolor] Error loading icon ${config.icon}:`, error);
					}
				})().catch(console.error);
			}
		} else if (config.icon.startsWith('<svg') || config.icon.startsWith('data:image')) {
			// SVG content - render directly
			const iconEl = document.createElement('span');
			iconEl.className = `${pluginId}-custom-icon`;
			iconEl.style.setProperty('--icon-size', `${iconSize}px`);
			iconEl.setAttribute('data-icon-path', currentIconData);
			iconEl.innerHTML = config.icon;
			const svg = iconEl.querySelector('svg');
			if (svg) {
				svg.style.width = `${iconSize}px`;
				svg.style.height = `${iconSize}px`;
				svg.style.color = config.iconColor || 'currentColor';
				if (!svg.hasAttribute('width')) {
					svg.setAttribute('width', `${iconSize}`);
				}
				if (!svg.hasAttribute('height')) {
					svg.setAttribute('height', `${iconSize}`);
				}
			}
			
			// Insert icon at the beginning of folder name
			const textNode = Array.from(folderName.childNodes).find(node => 
				node.nodeType === Node.TEXT_NODE || 
				(node.nodeType === Node.ELEMENT_NODE && !(node as Element).classList.contains(`${pluginId}-custom-icon`))
			);
			
			if (textNode) {
				folderName.insertBefore(iconEl, textNode);
			} else {
				folderName.insertBefore(iconEl, folderName.firstChild);
			}
		} else if (config.icon.startsWith('http') || config.icon.startsWith('/') || config.icon.includes('.')) {
			// External URL - use img as fallback
			const iconEl = document.createElement('span');
			iconEl.className = `${pluginId}-custom-icon`;
			iconEl.style.setProperty('--icon-size', `${iconSize}px`);
			iconEl.setAttribute('data-icon-path', currentIconData);
			const img = document.createElement('img');
			img.src = config.icon;
			img.alt = '';
			img.style.width = `${iconSize}px`;
			img.style.height = `${iconSize}px`;
			img.style.display = 'block';
			if (config.iconColor) {
				img.style.filter = getColorFilter(config.iconColor);
			}
			iconEl.appendChild(img);
			
			// Insert icon at the beginning of folder name
			const textNode = Array.from(folderName.childNodes).find(node => 
				node.nodeType === Node.TEXT_NODE || 
				(node.nodeType === Node.ELEMENT_NODE && !(node as Element).classList.contains(`${pluginId}-custom-icon`))
			);
			
			if (textNode) {
				folderName.insertBefore(iconEl, textNode);
			} else {
				folderName.insertBefore(iconEl, folderName.firstChild);
			}
		}
	} else {
		// Remove icon if no config or no icon
		const allExistingIcons = folderName.querySelectorAll(`.${pluginId}-custom-icon`);
		allExistingIcons.forEach(icon => icon.remove());
		
		// Clear loading marker
		folderName.removeAttribute('data-iconocolor-loading');
		
		if (folderIcon) {
			const existingIconInIconArea = folderIcon.querySelectorAll(`.${pluginId}-custom-icon`);
			existingIconInIconArea.forEach(icon => icon.remove());
		}
	}
}


/**
 * Gets the folder path from a DOM element
 */
export function getFolderPathFromElement(element: HTMLElement): string | null {
	// Try to find the folder title element
	let folderTitle = element.querySelector('.nav-folder-title');
	
	// If not found, check if the element itself is a folder title
	if (!folderTitle && element.classList.contains('nav-folder-title')) {
		folderTitle = element;
	}
	
	// Also check parent elements
	if (!folderTitle) {
		folderTitle = element.closest('.nav-folder-title') as HTMLElement;
	}
	
	if (!folderTitle) return null;

	const dataPath = folderTitle.getAttribute('data-path');
	return dataPath || null;
}

/**
 * Finds all folder elements in the file explorer
 */
export function getAllFolderElements(): HTMLElement[] {
	const fileExplorer = document.querySelector('.nav-files-container');
	if (!fileExplorer) return [];

	return Array.from(fileExplorer.querySelectorAll('.nav-folder')) as HTMLElement[];
}

