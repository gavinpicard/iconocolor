import { Plugin, TFolder } from 'obsidian';
import { FolderConfig, IconocolorSettings, DefaultIconRule, ColorTransformation } from './types';
import { applyFolderStyles, getAllFolderElements, getFolderPathFromElement } from './utils/domUtils';
import { generateGradientColors, generateRepeatingColors, applyHSLTransformation, applyLightnessTransformation, interpolateColor } from './utils/colorUtils';

export class FolderManager {
	private plugin: Plugin;
	private settings: IconocolorSettings;
	private observer: MutationObserver | null = null;
	private focusChangeHandler: ((e: FocusEvent) => void) | null = null;
	private fileExplorer: HTMLElement | null = null;
	private rootFoldersCache: string[] | null = null;
	private rootFoldersCacheTimestamp: number = 0;
	private readonly ROOT_FOLDERS_CACHE_DURATION = 5000; // 5 seconds

	constructor(plugin: Plugin, settings: IconocolorSettings) {
		this.plugin = plugin;
		this.settings = settings;
	}

	/**
	 * Initialize the folder manager and start observing DOM changes
	 */
	initialize(): void {
		this.applyAllStyles();
		this.startObserving();
	}

	/**
	 * Start observing the file explorer for changes
	 */
	private startObserving(): void {
		const fileExplorer = document.querySelector('.nav-files-container');
		if (!fileExplorer) {
			// Wait for file explorer to be available
			setTimeout(() => this.startObserving(), 100);
			return;
		}

		// Debounce to avoid excessive updates
		// Increased delay to give newly created folders time to initialize
		let timeout: NodeJS.Timeout | null = null;
		let isApplying = false;
		this.observer = new MutationObserver((mutations) => {
			// Check if any mutation involves an input field (folder being renamed)
			// If so, skip this update to prevent cursor jumping
			const hasInputMutation = mutations.some(mutation => {
				for (const node of Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes))) {
					if (node.nodeType === Node.ELEMENT_NODE) {
						const element = node as HTMLElement;
						if (element.tagName === 'INPUT' || element.querySelector('input')) {
							return true;
						}
					}
				}
				return false;
			});
			
			// If there's an active input in the file explorer, skip updates
			const fileExplorer = document.querySelector('.nav-files-container');
			if (fileExplorer) {
				const activeInput = fileExplorer.querySelector('input:focus, [contenteditable="true"]:focus');
				if (activeInput) {
					// User is typing, skip this update
					return;
				}
			}
			
			if (isApplying) return; // Skip if already applying
			
			if (timeout) {
				clearTimeout(timeout);
			}
			timeout = setTimeout(() => {
				isApplying = true;
				this.applyAllStyles();
				// Reset flag after a short delay
				setTimeout(() => {
					isApplying = false;
				}, 50);
			}, 50); // Reduced from 300ms to 50ms for faster updates
		});

		this.observer.observe(fileExplorer, {
			childList: true,
			subtree: true,
		});

		// Also listen for workspace changes
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('layout-change', () => {
				setTimeout(() => this.applyAllStyles(), 50);
			})
		);

		// Listen for vault changes to handle newly created folders
		this.plugin.registerEvent(
			this.plugin.app.vault.on('create', (file) => {
				// If a folder was created, wait a bit for it to be fully initialized, then apply styles
				if (file instanceof TFolder) {
					this.invalidateRootFoldersCache();
					setTimeout(() => {
						this.applyAllStyles();
					}, 100);
				}
			})
		);

		// Listen for rename events to apply styles after renaming completes
		this.plugin.registerEvent(
			this.plugin.app.vault.on('rename', (file, oldPath) => {
				// After a folder is renamed, apply styles
				if (file instanceof TFolder) {
					this.invalidateRootFoldersCache();
					setTimeout(() => {
						this.applyAllStyles();
					}, 50);
				}
			})
		);

		// Also listen for focus/blur events on input fields to detect when renaming starts/stops
		// This helps catch cases where the rename input might not trigger vault events immediately
		this.fileExplorer = fileExplorer as HTMLElement;
		this.focusChangeHandler = (e: FocusEvent) => {
			// Check if the blur event is from an input field in the file explorer
			const target = e.target as HTMLElement;
			if (target && (target.tagName === 'INPUT' || target.hasAttribute('contenteditable'))) {
				// User finished editing, apply styles after a short delay
				setTimeout(() => {
					this.applyAllStyles();
				}, 50);
			}
		};

		// Listen for blur events on the file explorer (when user finishes editing)
		fileExplorer.addEventListener('blur', this.focusChangeHandler, true);
	}

	/**
	 * Stop observing DOM changes
	 */
	stopObserving(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		
		// Clean up focus change handler
		if (this.fileExplorer && this.focusChangeHandler) {
			this.fileExplorer.removeEventListener('blur', this.focusChangeHandler, true);
			this.focusChangeHandler = null;
			this.fileExplorer = null;
		}
	}

	/**
	 * Check if a folder element is currently being renamed/edited
	 */
	private isFolderBeingRenamed(folder: HTMLElement): boolean {
		// Check if there's an active input field in the folder (indicates renaming)
		const input = folder.querySelector('input[type="text"]') as HTMLInputElement;
		if (input && document.activeElement === input) {
			return true;
		}
		
		// Also check for contenteditable elements that are focused
		const contentEditable = folder.querySelector('[contenteditable="true"]') as HTMLElement;
		if (contentEditable && document.activeElement === contentEditable) {
			return true;
		}
		
		return false;
	}

	/**
	 * Apply styles to all folders in the file explorer
	 */
	applyAllStyles(): void {
		const folders = getAllFolderElements();
		const iconSize = this.settings.iconSize || 16;
		
		for (const folder of folders) {
			try {
				// Skip folders that are currently being renamed/edited to prevent cursor jumping
				if (this.isFolderBeingRenamed(folder)) {
					continue;
				}

				const folderPath = getFolderPathFromElement(folder);
				if (!folderPath) continue;

				// Verify the folder actually exists in the vault (skip if it doesn't exist yet)
				// This prevents errors when folders are being created
				const folderExists = this.plugin.app.vault.getAbstractFileByPath(folderPath);
				if (!folderExists || !(folderExists instanceof TFolder)) {
					// Folder doesn't exist yet or isn't a folder, skip it - it will be processed on next update
					continue;
				}

				// Get computed colors for this folder (base color + transformations)
				const computedColors = this.getComputedColors(folderPath);
				
				// Build config from computed colors
				const config: FolderConfig = {
					icon: this.getConfigForPath(folderPath)?.icon,
					iconColor: computedColors.iconColor,
					folderColor: computedColors.folderColor,
					textColor: computedColors.textColor,
				};
				
				// Apply default icon if no explicit icon is set
				if (!config.icon && this.settings.defaultIconRules) {
					const defaultIcon = this.getDefaultIconForPath(folderPath, 'folder');
					if (defaultIcon) {
						config.icon = defaultIcon.icon;
						if (defaultIcon.iconColor && !config.iconColor) {
							config.iconColor = defaultIcon.iconColor;
						}
					}
				}
				
				// Calculate opacity for this folder (only if it has a background color)
				// Opacity accumulates per nesting level, but only applies if folder has a color
				const finalOpacity = config.folderColor ? this.getComputedOpacity(folderPath) : this.settings.folderColorOpacity;
				
				// Always call applyFolderStyles
				applyFolderStyles(folder, config, this.plugin.manifest.id, iconSize, this.plugin.app, finalOpacity);
			} catch (error) {
				// Silently skip folders that cause errors (e.g., during creation)
				// They will be processed on the next update once they're fully initialized
				console.debug('[Iconocolor] Skipping folder due to error:', error);
				continue;
			}
		}
	}

	/**
	 * Get all root-level folders (folders at the root of the vault)
	 * Uses the vault API to get actual folder count, not just rendered ones
	 * Results are cached for 5 seconds to improve performance
	 */
	private getRootFolders(): string[] {
		const now = Date.now();
		// Return cached result if still valid
		if (this.rootFoldersCache && (now - this.rootFoldersCacheTimestamp < this.ROOT_FOLDERS_CACHE_DURATION)) {
			return this.rootFoldersCache;
		}
		
		// Get all folders from the vault
		const allFolders = this.plugin.app.vault.getAllFolders();
		const rootFolders: string[] = [];
		const seen = new Set<string>();
		
		for (const folder of allFolders) {
			const folderPath = folder.path;
			
			// Check if it's a root folder (no parent path or parent is empty)
			const pathParts = folderPath.split('/');
			if (pathParts.length === 1 && !seen.has(folderPath)) {
				rootFolders.push(folderPath);
				seen.add(folderPath);
			}
		}
		
		// Sort alphabetically (case-insensitive) for consistent ordering
		const sorted = rootFolders.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		
		// Cache the result
		this.rootFoldersCache = sorted;
		this.rootFoldersCacheTimestamp = now;
		
		return sorted;
	}
	
	/**
	 * Invalidate root folders cache (call when folders are created/renamed/deleted)
	 */
	private invalidateRootFoldersCache(): void {
		this.rootFoldersCache = null;
		this.rootFoldersCacheTimestamp = 0;
	}


	/**
	 * Get base color for a folder
	 * - If folder has explicit baseColor, use it
	 * - If root folder and auto-color enabled, get from palette
	 * - If subfolder and parent allows inheritance, get from parent with transformation
	 * - Otherwise, return undefined
	 */
	private getBaseColor(folderPath: string): string | undefined {
		const pathParts = folderPath.split('/');
		const isRootFolder = pathParts.length === 1;
		
		// Check for explicit base color
		const config = this.settings.folderConfigs[folderPath];
		if (config?.baseColor) {
			return config.baseColor;
		}
		
		// Root folder: get from palette if auto-color enabled
		if (isRootFolder && this.settings.autoColorEnabled) {
			const rootFolders = this.getRootFolders();
			const rootIndex = rootFolders.indexOf(folderPath);
			if (rootIndex >= 0) {
				const autoColors = this.generateAutoColors(rootFolders);
				if (rootIndex < autoColors.length) {
					return autoColors[rootIndex];
				}
			}
		}
		
		// Subfolder: inherit from parent if allowed
		// Check ALL ancestors up to root - if any have inheritance disabled, don't inherit
		if (!isRootFolder) {
			// Check if ANY ancestor has inheritance disabled
			let canInherit = true;
			for (let i = pathParts.length - 1; i > 0; i--) {
				const ancestorPath = pathParts.slice(0, i).join('/');
				const ancestorConfig = this.settings.folderConfigs[ancestorPath];
				if (ancestorConfig && ancestorConfig.inheritBaseColor === false) {
					canInherit = false;
					break;
				}
			}
			
			if (canInherit) {
				const parentPath = pathParts.slice(0, -1).join('/');
				const parentBaseColor = this.getBaseColor(parentPath);
				if (parentBaseColor) {
					// Apply child base transformation
					const transformedColor = this.applyChildBaseTransformation(parentBaseColor, folderPath, parentPath);
					// If transformation type is 'none', return undefined (no inheritance)
					if (transformedColor === '' && this.settings.childBaseTransformation.type === 'none') {
						return undefined;
					}
					return transformedColor || undefined;
				}
			}
		}
		
		return undefined;
	}

	/**
	 * Get computed opacity for a folder (accumulates per nesting level)
	 * Only applies if the folder can inherit (checks all ancestors up to root)
	 */
	private getComputedOpacity(folderPath: string): number {
		const pathParts = folderPath.split('/');
		const isRootFolder = pathParts.length === 1;
		
		// Root folder uses global opacity
		if (isRootFolder) {
			return this.settings.folderColorOpacity;
		}
		
		// Check if ANY ancestor has inheritance disabled
		// If so, this folder should not inherit opacity (use global)
		let canInherit = true;
		for (let i = pathParts.length - 1; i > 0; i--) {
			const ancestorPath = pathParts.slice(0, i).join('/');
			const ancestorConfig = this.settings.folderConfigs[ancestorPath];
			if (ancestorConfig && ancestorConfig.inheritBaseColor === false) {
				canInherit = false;
				break;
			}
		}
		
		if (!canInherit) {
			// If any ancestor has inheritance disabled, use global opacity
			return 0;
		}
		
		// Get parent's computed opacity (recursive)
		const parentPath = pathParts.slice(0, -1).join('/');
		const parentOpacity = this.getComputedOpacity(parentPath);
		
		// Apply child base transformation opacity (multiplicative)
		// backgroundOpacity is a percentage (0-100), so we multiply by it
		const childOpacityFactor = this.settings.childBaseTransformation.backgroundOpacity !== undefined 
			? this.settings.childBaseTransformation.backgroundOpacity / 100 
			: 1.0;
		
		return Math.max(0, Math.min(100, parentOpacity * childOpacityFactor));
	}

	/**
	 * Apply child base transformation to get child's base color from parent's base color
	 */
	private applyChildBaseTransformation(parentBaseColor: string, childPath: string, parentPath: string): string {
		const transformation = this.settings.childBaseTransformation;
		
		// If type is 'none', children don't inherit - return undefined to signal no inheritance
		if (transformation.type === 'none') {
			return ''; // Return empty string to signal no inheritance
		}
		
		// First, apply gradient if enabled (interpolate between parent and next sibling)
		let baseColor = parentBaseColor;
		if (transformation.useGradient) {
			baseColor = this.applyGradientTransformation(parentBaseColor, childPath, parentPath);
		}
		
		// Then apply the selected transformation (lightness or HSL)
		if (transformation.type === 'hsl') {
			return applyHSLTransformation(baseColor, {
				hue: transformation.hue,
				saturation: transformation.saturation,
				lightness: transformation.lightness,
			});
		} else if (transformation.type === 'lightness' && transformation.adjustment !== undefined) {
			return applyLightnessTransformation(baseColor, transformation.adjustment);
		}
		
		return baseColor;
	}

	/**
	 * Apply gradient transformation: interpolate between parent's base color and next sibling's base color
	 */
	private applyGradientTransformation(parentBaseColor: string, childPath: string, parentPath: string): string {
		const transformation = this.settings.childBaseTransformation;
		
		// Get all children of the parent
		const parentChildren = this.getChildrenFolders(parentPath);
		
		if (parentChildren.length === 0) {
			return parentBaseColor; // No siblings, can't create gradient
		}
		
		// Find this child's index among siblings
		const childName = childPath.split('/').pop() || '';
		const childIndex = parentChildren.indexOf(childName);
		
		if (childIndex < 0 || childIndex >= parentChildren.length) {
			return parentBaseColor; // Child not found in siblings list
		}
		
		// Get the next sibling at the parent's level (not child's siblings, but parent's siblings)
		const parentPathParts = parentPath.split('/');
		const isParentRoot = parentPathParts.length === 1;
		
		let nextSiblingBaseColor: string | undefined;
		
		if (isParentRoot) {
			// Parent is root: get next root folder's base color
			const rootFolders = this.getRootFolders();
			const parentIndex = rootFolders.indexOf(parentPath);
			if (parentIndex >= 0 && parentIndex < rootFolders.length - 1) {
				const nextRootPath = rootFolders[parentIndex + 1];
				nextSiblingBaseColor = this.getBaseColor(nextRootPath);
			}
		} else {
			// Parent is subfolder: get next sibling at parent's level
			const parentSiblings = this.getChildrenFolders(parentPathParts.slice(0, -1).join('/'));
			const parentName = parentPathParts[parentPathParts.length - 1];
			const parentSiblingIndex = parentSiblings.indexOf(parentName);
			
			if (parentSiblingIndex >= 0 && parentSiblingIndex < parentSiblings.length - 1) {
				const nextSiblingName = parentSiblings[parentSiblingIndex + 1];
				const nextSiblingPath = parentPathParts.slice(0, -1).concat(nextSiblingName).join('/');
				nextSiblingBaseColor = this.getBaseColor(nextSiblingPath);
			}
		}
		
		// If no next sibling found, use parent color
		if (!nextSiblingBaseColor) {
			return parentBaseColor;
		}
		
		// Calculate gradient step with 2 extra steps (default padding)
		// Children are distributed across intermediate steps, skipping first (parent) and last (next sibling)
		// Total steps = number of children + 2 (parent + children + next sibling)
		const totalSteps = parentChildren.length + 2;
		// Child index 0 maps to step 1 (skip step 0 which is parent)
		// Child index (length-1) maps to step (totalSteps-2) (skip last step which is next sibling)
		const stepIndex = childIndex + 1; // Offset by 1 to skip parent
		const step = totalSteps > 2 ? stepIndex / (totalSteps - 1) : 0.5; // If only 1 child, use middle
		const clampedStep = Math.max(0, Math.min(1, step));
		
		// Interpolate between parent and next sibling
		return interpolateColor(parentBaseColor, nextSiblingBaseColor, clampedStep);
	}

	/**
	 * Get all direct child folder names for a given parent path
	 */
	private getChildrenFolders(parentPath: string): string[] {
		const allFolders = this.plugin.app.vault.getAllFolders();
		const children: string[] = [];
		
		for (const folder of allFolders) {
			const folderPath = folder.path;
			const pathParts = folderPath.split('/');
			
			// Check if this folder is a direct child of parentPath
			if (pathParts.length === parentPath.split('/').length + 1) {
				const parentPart = pathParts.slice(0, -1).join('/');
				if (parentPart === parentPath) {
					children.push(pathParts[pathParts.length - 1]);
				}
			}
		}
		
		return children.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())); // Sort alphabetically (case-insensitive) for consistent ordering
	}

	/**
	 * Apply transformation to get element color from base color
	 */
	private applyTransformation(baseColor: string, transformation: ColorTransformation): string {
		if (transformation.type === 'hsl') {
			return applyHSLTransformation(baseColor, {
				hue: transformation.hue,
				saturation: transformation.saturation,
				lightness: transformation.lightness,
			});
		} else if (transformation.type === 'lightness' && transformation.adjustment !== undefined) {
			return applyLightnessTransformation(baseColor, transformation.adjustment);
		}
		
		return baseColor; // 'none' transformation
	}

	/**
	 * Get computed colors for a folder
	 * Returns iconColor, folderColor, and textColor based on base color + transformations
	 * Explicit colors in config override transformations
	 */
	private getComputedColors(folderPath: string): { iconColor?: string; folderColor?: string; textColor?: string } {
		const config = this.settings.folderConfigs[folderPath];
		const baseColor = this.getBaseColor(folderPath);
		
		const result: { iconColor?: string; folderColor?: string; textColor?: string } = {};
		
		// If explicit colors are set, use them (they override transformations)
		if (config?.iconColor !== undefined) {
			result.iconColor = config.iconColor;
		} else if (baseColor) {
			// Apply transformation to get icon color from base
			result.iconColor = this.applyTransformation(baseColor, this.settings.iconColorTransformation);
		}
		
		if (config?.folderColor !== undefined) {
			result.folderColor = config.folderColor;
		} else if (baseColor) {
			// Apply transformation to get folder color from base
			result.folderColor = this.applyTransformation(baseColor, this.settings.folderColorTransformation);
		}
		
		if (config?.textColor !== undefined) {
			result.textColor = config.textColor;
		} else if (baseColor) {
			// Apply transformation to get text color from base
			result.textColor = this.applyTransformation(baseColor, this.settings.textColorTransformation);
		}
		
		return result;
	}

	/**
	 * Get default icon for a path based on enabled rules
	 */
	private getDefaultIconForPath(path: string, type: 'base' | 'markdown' | 'folder'): { icon: string; iconColor?: string } | null {
		if (!this.settings.defaultIconRules || this.settings.defaultIconRules.length === 0) {
			return null;
		}

		// Get the name from the path (last part)
		const pathParts = path.split('/');
		const name = pathParts[pathParts.length - 1];

		// Check each enabled rule in order (first match wins)
		for (const rule of this.settings.defaultIconRules) {
			if (!rule.enabled || rule.type !== type || !rule.pattern || !rule.icon) {
				continue;
			}

			try {
				const regex = new RegExp(rule.pattern);
				if (regex.test(name)) {
					return {
						icon: rule.icon,
						iconColor: rule.iconColor,
					};
				}
			} catch (e) {
				// Invalid regex, skip this rule
				console.warn(`[Iconocolor] Invalid regex pattern in default icon rule: ${rule.pattern}`, e);
			}
		}

		return null;
	}

	/**
	 * Get configuration for a folder path (checking parent folders if needed)
	 */
	getConfigForPath(path: string): FolderConfig | null {
		// Check exact match first
		if (this.settings.folderConfigs[path]) {
			return this.settings.folderConfigs[path];
		}

		// Check parent folders
		const pathParts = path.split('/');
		for (let i = pathParts.length - 1; i > 0; i--) {
			const parentPath = pathParts.slice(0, i).join('/');
			const parentConfig = this.settings.folderConfigs[parentPath];
			
			if (parentConfig && parentConfig.applyToSubfolders) {
				return parentConfig;
			}
		}

		return null;
	}


	/**
	 * Generate auto-colors for root folders (helper method)
	 */
	private generateAutoColors(rootFolders: string[]): string[] {
		if (rootFolders.length === 0) return [];
		
		const activePalette = this.settings.colorPalettes[this.settings.activePaletteIndex];
		if (!activePalette || activePalette.colors.length === 0) return [];
		
		if (this.settings.autoColorMode === 'gradient') {
			return generateGradientColors(activePalette.colors, rootFolders.length);
		} else {
			return generateRepeatingColors(activePalette.colors, rootFolders.length);
		}
	}


	/**
	 * Set configuration for a folder path
	 * Only saves properties that are explicitly set (not undefined)
	 */
	async setFolderConfig(path: string, config: FolderConfig): Promise<void> {
		// Merge with existing config, only updating properties that are explicitly set
		const existing = this.settings.folderConfigs[path] || {};
		const merged: FolderConfig = { ...existing };
		
		// Only update properties that are explicitly provided (not undefined)
		if (config.icon !== undefined) merged.icon = config.icon;
		if (config.baseColor !== undefined) merged.baseColor = config.baseColor;
		if (config.iconColor !== undefined) merged.iconColor = config.iconColor;
		if (config.folderColor !== undefined) merged.folderColor = config.folderColor;
		if (config.textColor !== undefined) merged.textColor = config.textColor;
		if (config.applyToSubfolders !== undefined) merged.applyToSubfolders = config.applyToSubfolders;
		if (config.inheritBaseColor !== undefined) merged.inheritBaseColor = config.inheritBaseColor;
		
		// If config is empty, remove it entirely
		if (Object.keys(merged).length === 0) {
			delete this.settings.folderConfigs[path];
		} else {
			this.settings.folderConfigs[path] = merged;
		}
		
		await this.plugin.saveData(this.settings);
		this.applyAllStyles();
	}

	/**
	 * Remove configuration for a folder path
	 */
	async removeFolderConfig(path: string): Promise<void> {
		delete this.settings.folderConfigs[path];
		await this.plugin.saveData(this.settings);
		this.applyAllStyles();
	}

	/**
	 * Update settings reference
	 */
	async updateSettings(settings: IconocolorSettings): Promise<void> {
		this.settings = settings;
		this.invalidateRootFoldersCache(); // Settings change might affect root folders
		
		// Clean up saved configs: remove colors that match computed colors (from base + transformations)
		// This ensures folders update when transformation settings change
		let configsChanged = false;
		
		for (const folderPath in settings.folderConfigs) {
			const config = settings.folderConfigs[folderPath];
			const computedColors = this.getComputedColors(folderPath);
			
			// Clear saved colors that match computed colors (they should be derived, not saved)
			if (computedColors.iconColor && config.iconColor === computedColors.iconColor) {
				delete config.iconColor;
				configsChanged = true;
			}
			if (computedColors.folderColor && config.folderColor === computedColors.folderColor) {
				delete config.folderColor;
				configsChanged = true;
			}
			if (computedColors.textColor && config.textColor === computedColors.textColor) {
				delete config.textColor;
				configsChanged = true;
			}
		}
		
		// Save cleaned configs if any were changed
		if (configsChanged) {
			await this.plugin.saveData(settings);
		}
		
		this.applyAllStyles();
	}
}

