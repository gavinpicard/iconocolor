import { App, Modal, Setting, Notice } from 'obsidian';
import { FolderConfig, IconocolorSettings } from '../types';
import { IconInfo, searchIcons, getLucideIconUrl, isLucideIcon, getLucideIconName, renderIconAsSvg } from '../utils/iconService';
import { applyHSLTransformation, applyLightnessTransformation, getColorFilter } from '../utils/colorUtils';
import { ColorTransformation } from '../types';
import { isLocalIcon } from '../utils/iconDownloader';
import { getInstalledIconPacks, IconPack } from '../utils/iconPackManager';

export interface FolderConfigResult {
	icon?: string;
	baseColor?: string;
	iconColor?: string;
	folderColor?: string;
	textColor?: string;
	applyToSubfolders?: boolean;
	inheritBaseColor?: boolean;
}

type IconSource = 'all' | 'lucide' | 'simpleicons' | 'custom' | 'local' | string; // string for icon pack IDs

export class FolderConfigModal extends Modal {
	private result: FolderConfigResult = {};
	private onSubmit: (result: FolderConfigResult) => void;
	private currentSource: IconSource = 'all';
	private searchQuery: string = '';
	private searchResults: IconInfo[] = [];
	private selectedIcon: IconInfo | null = null;
	private settings: IconocolorSettings | undefined;
	private folderPath: string | undefined;
	private useBaseColorControl: boolean = true; // Toggle between base color and individual colors
	private searchTimeout: number | null = null; // For debouncing search

	// UI elements
	private resultsContainer: HTMLElement;
	private customInputContainer: HTMLElement;
	private previewEl: HTMLElement;
	private previewIcon: HTMLElement;
	private iconTabContent: HTMLElement;
	private colorTabContent: HTMLElement;

	constructor(app: App, currentConfig?: FolderConfig, settings?: IconocolorSettings, onSubmit?: (result: FolderConfigResult) => void, folderPath?: string) {
		super(app);
		this.folderPath = folderPath;
		
		if (currentConfig) {
			this.result.icon = currentConfig.icon;
			this.result.baseColor = currentConfig.baseColor;
			this.result.iconColor = currentConfig.iconColor;
			this.result.folderColor = currentConfig.folderColor;
			this.result.textColor = currentConfig.textColor;
			this.result.applyToSubfolders = currentConfig.applyToSubfolders || false;
			this.result.inheritBaseColor = currentConfig.inheritBaseColor !== undefined ? currentConfig.inheritBaseColor : true;
			
			// Determine control mode: if baseColor is set, use base control; otherwise use individual
			this.useBaseColorControl = currentConfig.baseColor !== undefined;

			if (currentConfig.icon) {
				if (isLucideIcon(currentConfig.icon)) {
					this.currentSource = 'lucide';
					this.selectedIcon = {
						name: getLucideIconName(currentConfig.icon),
						displayName: getLucideIconName(currentConfig.icon),
						source: 'lucide',
						url: currentConfig.icon,
					};
				} else if (isLocalIcon(currentConfig.icon)) {
					// Check if it's from an icon pack
					const pathParts = currentConfig.icon.split('/');
					if (pathParts.length >= 3 && pathParts[1] === 'icons') {
						const packId = pathParts[2];
						this.currentSource = packId;
					} else {
						this.currentSource = 'all';
					}
				} else {
					this.currentSource = 'custom';
				}
			}
		}
		
		this.settings = settings;
		this.onSubmit = onSubmit || (() => {});
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.addClass('folder-config-modal');
		
		// Header with folder path if available
		const header = contentEl.createDiv();
		header.addClass('folder-config-header');
		const title = header.createEl('h2', { text: 'Folder Configuration' });
		if (this.folderPath) {
			const pathEl = header.createEl('p', { text: this.folderPath });
			pathEl.addClass('folder-config-path');
		}

		// Tab navigation
		const tabContainer = contentEl.createDiv();
		tabContainer.addClass('folder-config-tabs');
		
		const iconTab = tabContainer.createEl('button', { text: 'Icons' });
		iconTab.addClass('folder-config-tab');
		iconTab.addClass('is-active');
		
		const colorTab = tabContainer.createEl('button', { text: 'Colors' });
		colorTab.addClass('folder-config-tab');
		
		// Tab content container
		const tabContentContainer = contentEl.createDiv();
		tabContentContainer.addClass('folder-config-tab-content');
		
		// Icons tab content
		this.iconTabContent = tabContentContainer.createDiv();
		this.iconTabContent.addClass('folder-config-tab-pane');
		this.iconTabContent.addClass('is-active');
		
		// Colors tab content
		this.colorTabContent = tabContentContainer.createDiv();
		this.colorTabContent.addClass('folder-config-tab-pane');
		
		// Tab switching
		iconTab.onclick = () => {
			iconTab.addClass('is-active');
			colorTab.removeClass('is-active');
			this.iconTabContent.addClass('is-active');
			this.colorTabContent.removeClass('is-active');
		};
		
		colorTab.onclick = () => {
			colorTab.addClass('is-active');
			iconTab.removeClass('is-active');
			this.colorTabContent.addClass('is-active');
			this.iconTabContent.removeClass('is-active');
		};
		
		// Build Icons tab
		this.buildIconsTab();
		
		// Build Colors tab
		this.buildColorsTab();
		
		// Preview and buttons (always visible)
		this.buildPreviewAndButtons(contentEl);

		// Initial load
		if (this.currentSource === 'custom') {
			this.showCustomInput();
		} else {
			setTimeout(async () => {
				try {
					await this.performSearch();
					await this.renderResults();
				} catch (error) {
					console.error('[Iconocolor] Error in initial search:', error);
				}
			}, 100);
		}
		this.updatePreview().catch(console.error);
	}

	private buildIconsTab(): void {
		const container = this.iconTabContent;
		container.empty();
		
		// Icon pack selector dropdown (more compact)
		const packSelector = new Setting(container)
			.setName('Icon pack')
			.setDesc('')
			.addDropdown(dropdown => {
				// Add "All" option
				dropdown.addOption('all', 'All');
				dropdown.addOption('lucide', 'Lucide');
				dropdown.addOption('simpleicons', 'SimpleIcons');
				
				// Add installed icon packs
				getInstalledIconPacks(this.app).then((installedPacks: IconPack[]) => {
					for (const pack of installedPacks) {
						if (pack.installed && pack.path) {
							// Use the pack folder name as the option value for better matching
							const packFolderName = pack.path.split('/').pop() || pack.id;
							dropdown.addOption(packFolderName, pack.name);
						}
					}
					
					dropdown.addOption('custom', 'Custom');
					
					// Set initial value - handle icon pack IDs
					let initialValue = this.currentSource || 'all';
					if (initialValue !== 'all' && initialValue !== 'lucide' && initialValue !== 'simpleicons' && initialValue !== 'custom') {
						// It's an icon pack ID - make sure it's in the dropdown
						// Check both by ID and by folder name
						const packExists = installedPacks.some((p: IconPack) => {
							if (!p.installed || !p.path) return false;
							const packFolderName = p.path.split('/').pop();
							return p.id === initialValue || packFolderName === initialValue;
						});
						if (!packExists) {
							initialValue = 'all'; // Fallback to 'all' if pack not found
						} else {
							// Use the folder name as the value
							const matchingPack = installedPacks.find((p: IconPack) => {
								if (!p.installed || !p.path) return false;
								const packFolderName = p.path.split('/').pop();
								return p.id === initialValue || packFolderName === initialValue;
							});
							if (matchingPack && matchingPack.path) {
								initialValue = matchingPack.path.split('/').pop() || initialValue;
							}
						}
					}
					dropdown.setValue(initialValue);
				}).catch(console.error);
				
				// Add custom option immediately (will be added again in promise, but that's fine)
				dropdown.addOption('custom', 'Custom');
				dropdown.setValue(this.currentSource || 'all');
				
				dropdown.onChange(async (value) => {
					this.currentSource = value;
					if (value === 'custom') {
						this.showCustomInput();
					} else {
						// Clear any pending search timeout
						if (this.searchTimeout !== null) {
							clearTimeout(this.searchTimeout);
							this.searchTimeout = null;
						}
						await this.performSearch();
					}
				});
			});

		// Search (larger)
		if (this.currentSource !== 'custom') {
			const searchContainer = container.createDiv();
			searchContainer.addClass('folder-config-search-large');
			const searchInput = searchContainer.createEl('input');
			searchInput.type = 'text';
			searchInput.placeholder = 'Search icons...';
			searchInput.value = this.searchQuery;
			searchInput.addClass('folder-config-input-large');
			searchInput.oninput = (e) => {
				this.searchQuery = (e.target as HTMLInputElement).value;
				// Debounce search - wait 300ms after user stops typing
				if (this.searchTimeout !== null) {
					clearTimeout(this.searchTimeout);
				}
				this.searchTimeout = window.setTimeout(async () => {
					try {
						await this.performSearch();
					} catch (error) {
						console.error('[Iconocolor] Error in search:', error);
					}
				}, 300);
			};
		}

		// Results grid (larger)
		this.resultsContainer = container.createDiv();
		this.resultsContainer.addClass('icon-picker-results-large');

		// Custom input
		this.customInputContainer = container.createDiv();
		this.customInputContainer.addClass('icon-picker-custom-input');
		this.customInputContainer.style.display = this.currentSource === 'custom' ? 'block' : 'none';

		const customInput = this.customInputContainer.createEl('input');
		customInput.type = 'text';
		customInput.placeholder = 'Icon path or URL';
		customInput.value = this.currentSource === 'custom' ? (this.result.icon || '') : '';
		customInput.addClass('folder-config-input-large');
		customInput.oninput = (e) => {
			this.result.icon = (e.target as HTMLInputElement).value;
			this.updatePreview().catch(console.error);
		};
	}

	private buildColorsTab(): void {
		const container = this.colorTabContent;
		container.empty();
		
		if (!this.settings) {
			container.createEl('p', { text: 'Settings not available' });
			return;
		}
		
		// Toggle between base color control and individual colors
		const controlModeRow = container.createDiv();
		controlModeRow.addClass('folder-config-toggle-row');
		
		new Setting(controlModeRow)
			.setName('Control mode')
			.setDesc('')
			.addDropdown(dropdown => {
				dropdown
					.addOption('base', 'Base color')
					.addOption('individual', 'Individual colors');
				dropdown.setValue(this.useBaseColorControl ? 'base' : 'individual');
				dropdown.onChange((value) => {
					const wasBaseMode = this.useBaseColorControl;
					this.useBaseColorControl = value === 'base';
					
					// When switching modes, clear the opposite mode's values
					if (wasBaseMode && !this.useBaseColorControl) {
						// Switching from base to individual: clear baseColor
						this.result.baseColor = undefined;
					} else if (!wasBaseMode && this.useBaseColorControl) {
						// Switching from individual to base: clear individual colors
						this.result.iconColor = undefined;
						this.result.folderColor = undefined;
						this.result.textColor = undefined;
					}
					
					this.buildColorsTab(); // Rebuild to show correct controls
					this.updatePreview().catch(console.error);
				});
			});
		
		// Get base color (from config or computed) - use async IIFE
		(async () => {
			const baseColor = await this.getBaseColor();
			
			if (this.useBaseColorControl) {
				// Base color control mode
				this.buildBaseColorControl(container, baseColor);
			} else {
				// Individual colors control mode
				this.buildIndividualColorsControl(container, baseColor);
			}
		})().catch(console.error);
		
		// Inherit base color toggle (for children)
		const inheritRow = container.createDiv();
		inheritRow.addClass('folder-config-toggle-row');
		
		new Setting(inheritRow)
			.setName('Children inherit base color')
			.setDesc('')
			.addToggle(toggle => {
				toggle
					.setValue(this.result.inheritBaseColor !== false) // Default to true
					.onChange((value) => {
						this.result.inheritBaseColor = value;
					});
			});
	}

	/**
	 * Get base color for this folder (from config or computed)
	 */
	private async getBaseColor(): Promise<string | undefined> {
		// If explicit base color is set, use it
		if (this.result.baseColor) {
			return this.result.baseColor;
		}
		
		// Otherwise, compute it (from palette if root + auto enabled, or from parent)
		// This is a simplified version - the actual computation is in folderManager
		if (!this.settings || !this.folderPath) {
			return undefined;
		}
		
		const pathParts = this.folderPath.split('/');
		const isRootFolder = pathParts.length === 1;
		
		// Root folder: get from palette if auto-color enabled
		if (isRootFolder && this.settings.autoColorEnabled) {
			const rootFolders = this.getRootFolders();
			const rootIndex = rootFolders.indexOf(this.folderPath);
			if (rootIndex >= 0) {
				const autoColors = await this.generateAutoColors(rootFolders);
				if (rootIndex < autoColors.length) {
					return autoColors[rootIndex];
				}
			}
		}
		
		// For subfolders, we'd need to compute from parent, but that's complex
		// For now, just return undefined if not explicitly set
		return undefined;
	}

	/**
	 * Build base color control UI
	 */
	private buildBaseColorControl(container: HTMLElement, computedBaseColor: string | undefined): void {
		// Base color input
		const baseColorRow = container.createDiv();
		baseColorRow.addClass('folder-config-color-row');
		
		const labelContainer = baseColorRow.createDiv();
		labelContainer.addClass('folder-config-color-label-container');
		
		const labelEl = labelContainer.createEl('label');
		labelEl.setText('Base color');
		labelEl.addClass('folder-config-color-label');
		
		const inputContainer = baseColorRow.createDiv();
		inputContainer.addClass('folder-config-color-input-container');
		
		// Quick color picker from palette
		if (this.settings && this.settings.colorPalettes.length > 0) {
			const activePalette = this.settings.colorPalettes[this.settings.activePaletteIndex || 0];
			if (activePalette && activePalette.colors.length > 0) {
				const quickColors = inputContainer.createDiv();
				quickColors.addClass('quick-color-picker-compact');
				activePalette.colors.forEach(color => {
					const swatch = quickColors.createDiv();
					swatch.addClass('quick-color-swatch');
					swatch.style.backgroundColor = color;
					swatch.title = color;
					swatch.onclick = () => {
						this.result.baseColor = color;
						// Clear individual colors when base color is set
						this.result.iconColor = undefined;
						this.result.folderColor = undefined;
						this.result.textColor = undefined;
						const textInput = inputContainer.querySelector('input[type="text"]') as HTMLInputElement;
						const colorInput = inputContainer.querySelector('input[type="color"]') as HTMLInputElement;
						if (textInput) textInput.value = color;
						if (colorInput) colorInput.value = color;
						this.updatePreview().catch(console.error);
					};
				});
			}
		}
		
		// HTML5 color picker
		const colorPicker = inputContainer.createEl('input');
		colorPicker.type = 'color';
		colorPicker.value = this.result.baseColor || computedBaseColor || '#000000';
		colorPicker.addClass('folder-config-color-picker');
		colorPicker.onchange = (e: Event) => {
			const value = (e.target as HTMLInputElement).value;
			this.result.baseColor = value;
			const textInput = inputContainer.querySelector('input[type="text"]') as HTMLInputElement;
			if (textInput) textInput.value = value;
			this.updatePreview().catch(console.error);
		};
		
		// Text input
		const input = inputContainer.createEl('input');
		input.type = 'text';
		input.placeholder = '#000000';
		input.value = this.result.baseColor || computedBaseColor || '';
		input.addClass('folder-config-input');
		input.addClass('folder-config-color-text-input');
		input.style.width = '100px';
		input.oninput = (e: Event) => {
			const value = (e.target as HTMLInputElement).value;
			this.result.baseColor = value || undefined;
			// Clear individual colors when base color is set
			if (this.result.baseColor) {
				this.result.iconColor = undefined;
				this.result.folderColor = undefined;
				this.result.textColor = undefined;
			}
			const colorInput = inputContainer.querySelector('input[type="color"]') as HTMLInputElement;
			if (colorInput && /^#[0-9A-F]{6}$/i.test(value)) {
				colorInput.value = value;
			}
			this.updatePreview().catch(console.error);
		};
		
		// Show computed colors from base (read-only)
		const baseColorToUse = this.result.baseColor || computedBaseColor;
		if (baseColorToUse) {
			const computedSection = container.createDiv();
			computedSection.addClass('folder-config-computed-colors');
			computedSection.style.marginTop = '8px';
			computedSection.style.padding = '8px';
			computedSection.style.background = 'var(--background-secondary)';
			computedSection.style.borderRadius = '4px';
			computedSection.style.border = '1px solid var(--background-modifier-border)';
			
			const computedTitle = computedSection.createEl('p', { text: 'Computed colors' });
			computedTitle.style.margin = '0 0 8px 0';
			computedTitle.style.fontSize = '11px';
			computedTitle.style.fontWeight = '500';
			computedTitle.style.color = 'var(--text-muted)';
			
			// Icon color
			if (this.settings) {
				const iconComputed = this.applyTransformation(baseColorToUse, this.settings.iconColorTransformation);
				this.addComputedColorDisplay(computedSection, 'Icon', iconComputed);
				
				// Folder color
				const folderComputed = this.applyTransformation(baseColorToUse, this.settings.folderColorTransformation);
				this.addComputedColorDisplay(computedSection, 'Background', folderComputed);
				
				// Text color
				const textComputed = this.applyTransformation(baseColorToUse, this.settings.textColorTransformation);
				this.addComputedColorDisplay(computedSection, 'Text', textComputed);
			}
		}
	}

	/**
	 * Build individual colors control UI
	 */
	private buildIndividualColorsControl(container: HTMLElement, computedBaseColor: string | undefined): void {
		const baseColorToUse = this.result.baseColor || computedBaseColor;
		
		if (this.settings) {
			// Icon color
			let iconComputed: string | undefined;
			let iconIsComputed = false;
			if (this.result.iconColor !== undefined) {
				// Explicitly set - not computed
			} else if (baseColorToUse) {
				iconComputed = this.applyTransformation(baseColorToUse, this.settings.iconColorTransformation);
				iconIsComputed = true;
			}
			
			// In individual colors mode, controls should NOT be disabled even if computed
			// The user should be able to override computed values
			this.addColorInputWithAutoColor(
				container,
				'Icon',
				'iconColor',
				this.result.iconColor || iconComputed,
				false, // isAutoColored
				undefined, // autoColorValue
				false, // isLinked
				false, // isRelative - set to false so controls are enabled
				iconIsComputed ? `Currently computed from base: ${iconComputed}. Set a value to override.` : undefined
			);
			
			// Folder background color
			let folderComputed: string | undefined;
			let folderIsComputed = false;
			if (this.result.folderColor !== undefined) {
				// Explicitly set - not computed
			} else if (baseColorToUse) {
				folderComputed = this.applyTransformation(baseColorToUse, this.settings.folderColorTransformation);
				folderIsComputed = true;
			}
			
			this.addColorInputWithAutoColor(
				container,
				'Background',
				'folderColor',
				this.result.folderColor || folderComputed,
				false, // isAutoColored
				undefined, // autoColorValue
				false, // isLinked
				false, // isRelative - set to false so controls are enabled
				folderIsComputed ? `Currently computed from base: ${folderComputed}. Set a value to override.` : undefined
			);
			
			// Text color
			let textComputed: string | undefined;
			let textIsComputed = false;
			if (this.result.textColor !== undefined) {
				// Explicitly set - not computed
			} else if (baseColorToUse) {
				textComputed = this.applyTransformation(baseColorToUse, this.settings.textColorTransformation);
				textIsComputed = true;
			}
			
			this.addColorInputWithAutoColor(
				container,
				'Text',
				'textColor',
				this.result.textColor || textComputed,
				false, // isAutoColored
				undefined, // autoColorValue
				false, // isLinked
				false, // isRelative - set to false so controls are enabled
				textIsComputed ? `Currently computed from base: ${textComputed}. Set a value to override.` : undefined
			);
		}
	}

	/**
	 * Add a read-only computed color display
	 */
	private addComputedColorDisplay(container: HTMLElement, label: string, color: string): void {
		const row = container.createDiv();
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '8px';
		row.style.marginBottom = '4px';
		
		const labelEl = row.createEl('span', { text: label });
		labelEl.style.fontSize = '12px';
		labelEl.style.minWidth = '70px';
		
		const colorDisplay = row.createDiv();
		colorDisplay.style.width = '20px';
		colorDisplay.style.height = '20px';
		colorDisplay.style.borderRadius = '3px';
		colorDisplay.style.border = '1px solid var(--background-modifier-border)';
		colorDisplay.style.backgroundColor = color;
		
		const valueEl = row.createEl('span', { text: color });
		valueEl.style.fontFamily = 'var(--font-monospace)';
		valueEl.style.fontSize = '11px';
		valueEl.style.color = 'var(--text-muted)';
	}

	/**
	 * Apply transformation to a color
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

	private buildPreviewAndButtons(contentEl: HTMLElement): void {
		// Container for preview and buttons on the same line
		const bottomContainer = contentEl.createDiv();
		bottomContainer.addClass('folder-config-bottom-container');
		bottomContainer.style.display = 'flex';
		bottomContainer.style.alignItems = 'center';
		bottomContainer.style.justifyContent = 'space-between';
		bottomContainer.style.gap = '12px';
		bottomContainer.style.marginTop = '12px';
		bottomContainer.style.paddingTop = '12px';
		bottomContainer.style.borderTop = '1px solid var(--background-modifier-border)';
		
		// Compact preview
		this.previewEl = bottomContainer.createDiv();
		this.previewEl.addClass('folder-config-preview-compact');
		this.previewEl.style.display = 'flex';
		this.previewEl.style.alignItems = 'center';
		this.previewEl.style.gap = '8px';
		this.previewEl.style.flex = '1';
		
		const previewLabel = this.previewEl.createSpan();
		previewLabel.setText('Preview:');
		previewLabel.style.fontSize = '12px';
		previewLabel.style.color = 'var(--text-muted)';
		previewLabel.style.fontWeight = '500';
		
		const previewContent = this.previewEl.createDiv();
		previewContent.addClass('folder-config-preview-content');
		previewContent.addClass('tree-item-inner');
		previewContent.style.padding = '6px 10px';
		previewContent.style.minHeight = '28px';
		previewContent.style.flex = '1';
		previewContent.style.maxWidth = '250px';
		this.previewIcon = previewContent.createDiv();
		this.previewIcon.addClass('preview-icon');
		this.previewIcon.addClass('iconocolor-custom-icon');
		const previewText = previewContent.createSpan();
		previewText.addClass('preview-text');
		previewText.setText(this.folderPath ? this.folderPath.split('/').pop() || 'Folder Name' : 'Folder Name');

		// Buttons on the same line
		const buttonContainer = bottomContainer.createDiv();
		buttonContainer.addClass('folder-config-buttons');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '8px';
		buttonContainer.style.marginTop = '0';
		buttonContainer.style.paddingTop = '0';
		buttonContainer.style.borderTop = 'none';
		buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cta' }).onclick = () => this.close();
		const applyButton = buttonContainer.createEl('button', { text: 'Apply', cls: 'mod-cta' });
		applyButton.onclick = () => {
			this.onSubmit(this.result);
			this.close();
		};
	}

	/**
	 * Get root folders (helper for modal)
	 */
	private getRootFolders(): string[] {
		const allFolders = this.app.vault.getAllFolders();
		const rootFolders: string[] = [];
		const seen = new Set<string>();
		
		for (const folder of allFolders) {
			const folderPath = folder.path;
			const pathParts = folderPath.split('/');
			if (pathParts.length === 1 && !seen.has(folderPath)) {
				rootFolders.push(folderPath);
				seen.add(folderPath);
			}
		}
		
		return rootFolders.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
	}

	/**
	 * Generate auto-colors for root folders (helper for modal)
	 */
	private async generateAutoColors(rootFolders: string[]): Promise<string[]> {
		if (!this.settings || rootFolders.length === 0) return [];
		
		const activePalette = this.settings.colorPalettes[this.settings.activePaletteIndex || 0];
		if (!activePalette || activePalette.colors.length === 0) return [];
		
		const { generateGradientColors, generateRepeatingColors } = await import('../utils/colorUtils');
		if (this.settings.autoColorMode === 'gradient') {
			return generateGradientColors(activePalette.colors, rootFolders.length);
		} else {
			return generateRepeatingColors(activePalette.colors, rootFolders.length);
		}
	}

	private addColorInputWithAutoColor(
		container: HTMLElement, 
		label: string, 
		colorKey: 'iconColor' | 'folderColor' | 'textColor', 
		currentValue?: string,
		isAutoColored: boolean = false,
		autoColorValue?: string,
		isLinked: boolean = false,
		isRelative: boolean = false,
		relativeDescription?: string
	): void {
		const colorRow = container.createDiv();
		colorRow.addClass('folder-config-color-row');
		
		const labelContainer = colorRow.createDiv();
		labelContainer.addClass('folder-config-color-label-container');
		
		const labelEl = labelContainer.createEl('label');
		labelEl.setText(label);
		labelEl.addClass('folder-config-color-label');
		
		// Add badges with better styling
		if (isAutoColored && autoColorValue) {
			const autoBadge = labelContainer.createEl('span', { text: 'Auto' });
			autoBadge.addClass('folder-config-auto-badge');
			autoBadge.addClass('folder-config-badge-primary');
			autoBadge.title = `Primary auto-color: ${autoColorValue}\nThis color is automatically set based on your auto-color settings.`;
		}
		if (isRelative && relativeDescription) {
			const relativeBadge = labelContainer.createEl('span', { text: 'Computed' });
			relativeBadge.addClass('folder-config-linked-badge');
			relativeBadge.addClass('folder-config-badge-secondary');
			relativeBadge.title = relativeDescription;
		}
		if (isLinked && !isRelative) {
			const linkedBadge = labelContainer.createEl('span', { text: 'Linked' });
			linkedBadge.addClass('folder-config-linked-badge');
			linkedBadge.addClass('folder-config-badge-secondary');
			linkedBadge.title = 'Text color is automatically derived from icon color';
		}
		
		const inputContainer = colorRow.createDiv();
		inputContainer.addClass('folder-config-color-input-container');
		
		// Quick color picker from palette
		if (this.settings && this.settings.colorPalettes.length > 0 && !isAutoColored && !isLinked && !isRelative) {
			const activePalette = this.settings.colorPalettes[this.settings.activePaletteIndex || 0];
			if (activePalette && activePalette.colors.length > 0) {
				const quickColors = inputContainer.createDiv();
				quickColors.addClass('quick-color-picker-compact');
				activePalette.colors.forEach(color => {
					const swatch = quickColors.createDiv();
					swatch.addClass('quick-color-swatch');
					swatch.style.backgroundColor = color;
					swatch.title = color;
					swatch.onclick = () => {
						(this.result as any)[colorKey] = color;
						// Clear base color when individual color is set
						this.result.baseColor = undefined;
						const textInput = inputContainer.querySelector('input[type="text"]') as HTMLInputElement;
						const colorInput = inputContainer.querySelector('input[type="color"]') as HTMLInputElement;
						if (textInput) textInput.value = color;
						if (colorInput) colorInput.value = color;
						this.updatePreview().catch(console.error);
					};
				});
			}
		}
		
		// HTML5 color picker
		const colorPicker = inputContainer.createEl('input');
		colorPicker.type = 'color';
		colorPicker.value = currentValue || '#000000';
		colorPicker.addClass('folder-config-color-picker');
		
		if (isAutoColored || isRelative || isLinked) {
			colorPicker.disabled = true;
			colorPicker.style.opacity = '0.5';
			colorPicker.style.cursor = 'not-allowed';
		} else {
			colorPicker.onchange = (e: Event) => {
				const value = (e.target as HTMLInputElement).value;
				(this.result as any)[colorKey] = value;
				const textInput = inputContainer.querySelector('input[type="text"]') as HTMLInputElement;
				if (textInput) textInput.value = value;
				this.updatePreview().catch(console.error);
			};
		}
		
		// Text input for hex value
		const input = inputContainer.createEl('input');
		input.type = 'text';
		input.placeholder = '#000000';
		input.value = currentValue || '';
		input.addClass('folder-config-input');
		input.addClass('folder-config-color-text-input');
		input.style.width = '100px';
		
		if (isAutoColored || isRelative || isLinked) {
			input.disabled = true;
			input.style.opacity = '0.6';
			input.style.cursor = 'not-allowed';
			if (isAutoColored) {
				input.title = `Primary auto-color: ${autoColorValue || 'N/A'}\nEnable "Exclude from auto-coloring" to set manually.`;
			} else if (isRelative) {
				input.title = relativeDescription || 'Relative auto-color\nDisable relative coloring in settings to set manually.';
			} else if (isLinked) {
				input.title = 'Linked to icon color\nUnlink to set manually.';
			}
		} else {
			input.oninput = (e: Event) => {
				const value = (e.target as HTMLInputElement).value;
				(this.result as any)[colorKey] = value || undefined;
				// Clear base color when individual color is set
				if (value) {
					this.result.baseColor = undefined;
				}
				const colorInput = inputContainer.querySelector('input[type="color"]') as HTMLInputElement;
				if (colorInput && /^#[0-9A-F]{6}$/i.test(value)) {
					colorInput.value = value;
				}
				this.updatePreview().catch(console.error);
			};
			
			// Sync color picker when text input changes
			input.onchange = (e: Event) => {
				const value = (e.target as HTMLInputElement).value;
				if (/^#[0-9A-F]{6}$/i.test(value)) {
					colorPicker.value = value;
				}
			};
			
			// Clear base color when individual color is set via color picker
			colorPicker.onchange = (e: Event) => {
				const value = (e.target as HTMLInputElement).value;
				(this.result as any)[colorKey] = value;
				this.result.baseColor = undefined;
				const textInput = inputContainer.querySelector('input[type="text"]') as HTMLInputElement;
				if (textInput) textInput.value = value;
				this.updatePreview().catch(console.error);
			};
		}
	}

	private addColorInput(container: HTMLElement, label: string, colorKey: 'iconColor' | 'folderColor' | 'textColor', currentValue?: string, showQuickPicker: boolean = true): void {
		const colorRow = container.createDiv();
		colorRow.addClass('folder-config-color-row');
		
		const labelEl = colorRow.createEl('label');
		labelEl.setText(label);
		labelEl.addClass('folder-config-color-label');

		const inputContainer = colorRow.createDiv();
		inputContainer.addClass('folder-config-color-input-container');

		// Quick color picker from palette
		if (showQuickPicker && this.settings && this.settings.colorPalettes.length > 0) {
			const activePalette = this.settings.colorPalettes[this.settings.activePaletteIndex || 0];
			if (activePalette && activePalette.colors.length > 0) {
				const quickColors = inputContainer.createDiv();
				quickColors.addClass('quick-color-picker-compact');
				activePalette.colors.forEach(color => {
					const swatch = quickColors.createDiv();
					swatch.addClass('quick-color-swatch');
					swatch.style.backgroundColor = color;
					swatch.title = color;
					swatch.onclick = () => {
						(this.result as any)[colorKey] = color;
						const input = inputContainer.querySelector('input') as HTMLInputElement;
						if (input) input.value = color;
						this.updatePreview().catch(console.error);
					};
				});
			}
		}

		const input = inputContainer.createEl('input');
		input.type = 'text';
		input.placeholder = '#000000';
		input.value = currentValue || '';
		input.addClass('folder-config-input');
		input.style.width = '80px';
		input.oninput = (e) => {
			(this.result as any)[colorKey] = (e.target as HTMLInputElement).value || undefined;
			this.updatePreview().catch(console.error);
		};
	}


	private async performSearch(): Promise<void> {
		if (this.currentSource === 'custom') {
			this.showCustomInput();
			return;
		}

		// Don't force refresh on every search - use cache unless explicitly needed
		const { searchIcons } = await import('../utils/iconService');

		// Handle "all" or specific sources
		if (this.currentSource === 'all') {
			// Search across all sources
			if (!this.searchQuery.trim()) {
				this.searchResults = await this.getPopularIcons();
			} else {
				// Use searchIcons with 'all' source - it will search everything
				this.searchResults = await searchIcons(this.searchQuery, 'all', this.app);
			}
		} else {
			// Specific source (lucide, simpleicons, or icon pack ID)
			if (!this.searchQuery.trim()) {
				this.searchResults = await this.getPopularIcons();
			} else {
				this.searchResults = await searchIcons(this.searchQuery, this.currentSource as any, this.app);
			}
		}

		// Remove duplicates based on name + source + path combination
		const seen = new Set<string>();
		this.searchResults = this.searchResults.filter(icon => {
			// Create unique key from name, source, and path
			const key = `${icon.name.toLowerCase()}-${icon.source}-${icon.path || icon.url || ''}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});

		await this.renderResults();
	}

	private async renderResults(): Promise<void> {
		if (this.currentSource === 'custom') {
			return;
		}

		this.resultsContainer.empty();
		this.resultsContainer.style.display = 'grid';

		// Only show "No icons found" if we actually have no results
		if (!this.searchResults || this.searchResults.length === 0) {
			this.resultsContainer.createEl('p', {
				text: 'No icons found.',
				cls: 'icon-picker-empty',
			});
			return;
		}

		// Limit to first 20 icons (no scrolling)
		const iconsToShow = this.searchResults.slice(0, 20);

		// Render icons in parallel batches for better performance
		const renderPromises = iconsToShow.map(async (iconInfo) => {
			const iconCard = this.resultsContainer.createDiv();
			iconCard.addClass('icon-picker-card');
			// Store unique identifier as data attribute for reliable selection
			const iconId = `${iconInfo.source}:${iconInfo.name}`;
			iconCard.setAttribute('data-icon-id', iconId);
			if (this.selectedIcon && this.selectedIcon.name === iconInfo.name && this.selectedIcon.source === iconInfo.source) {
				iconCard.addClass('is-selected');
			}

			const iconPreview = iconCard.createDiv();
			iconPreview.addClass('icon-picker-card-preview');
			
			// Use unified rendering for all icon types
			try {
				const iconElement = await renderIconAsSvg(iconInfo, 24, this.result.iconColor, this.app);
				iconPreview.appendChild(iconElement);
			} catch (error) {
				console.warn(`[Iconocolor] Failed to render icon ${iconInfo.name}:`, error);
			}

			const iconName = iconCard.createDiv();
			iconName.addClass('icon-picker-card-name');
			iconName.setText(iconInfo.displayName);

			iconCard.onclick = async () => {
				await this.selectIcon(iconInfo);
			};
		});

		// Wait for all icons to render
		await Promise.all(renderPromises);
	}


	private async getPopularIcons(): Promise<IconInfo[]> {
		const { searchIcons } = await import('../utils/iconService');
		
		// Use searchIcons with empty query to get all icons for the current source
		// This ensures we get native Lucide icons too if no local pack exists
		let allIcons = await searchIcons('', this.currentSource as any, this.app);
		
		// Remove duplicates
		const seen = new Set<string>();
		allIcons = allIcons.filter(icon => {
			const key = `${icon.name.toLowerCase()}-${icon.source}-${icon.path || icon.url || ''}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
		
		if (this.currentSource === 'lucide') {
			// Return first 10 Lucide icons
			return allIcons.slice(0, 10);
		} else if (this.currentSource === 'simpleicons') {
			// Return first 10 SimpleIcons
			return allIcons.slice(0, 10);
		} else if (this.currentSource === 'all') {
			// Return first 20 icons from all packs, but ensure variety
			// Try to get a mix of different sources if possible
			if (allIcons.length <= 20) {
				return allIcons;
			}
			
			// Get icons from different sources to show variety
			const lucideIcons = allIcons.filter(icon => icon.source === 'lucide').slice(0, 5);
			const simpleIcons = allIcons.filter(icon => icon.source === 'simpleicons').slice(0, 5);
			const packIcons = allIcons.filter(icon => icon.source === 'pack' || icon.source === 'local').slice(0, 10);
			
			// Combine and return up to 20
			const mixed = [...lucideIcons, ...simpleIcons, ...packIcons];
			return mixed.length > 0 ? mixed.slice(0, 20) : allIcons.slice(0, 20);
		} else if (this.currentSource !== 'custom') {
			// It's a specific icon pack
			return allIcons.slice(0, 20);
		}

		return [];
	}

	private async selectIcon(iconInfo: IconInfo): Promise<void> {
		this.selectedIcon = iconInfo;
		
		if (iconInfo.source === 'lucide') {
			this.result.icon = getLucideIconUrl(iconInfo.name);
		} else if (iconInfo.path) {
			// For all pack icons (Tabler, SimpleIcons, etc.) use the local path
			this.result.icon = iconInfo.path;
		}

		// Remove selection from all cards
		const cards = this.resultsContainer.querySelectorAll('.icon-picker-card');
		cards.forEach(card => {
			card.removeClass('is-selected');
		});
		
		// Find the selected card using the unique identifier
		const iconId = `${iconInfo.source}:${iconInfo.name}`;
		const selectedCard = this.resultsContainer.querySelector(`.icon-picker-card[data-icon-id="${iconId}"]`);
		if (selectedCard) {
			selectedCard.addClass('is-selected');
		}

		await this.updatePreview();
	}

	private showCustomInput(): void {
		this.resultsContainer.style.display = 'none';
		this.customInputContainer.style.display = 'block';
	}

	private async updatePreview(): Promise<void> {
		if (!this.previewEl) return;

		const previewContent = this.previewEl.querySelector('.folder-config-preview-content') as HTMLElement;
		if (!previewContent) return;

		// Update icon preview
		this.previewIcon.empty();
		if (this.result.icon) {
			// Create IconInfo from the current icon string
			let iconInfo: IconInfo | null = null;
			
			if (isLucideIcon(this.result.icon)) {
				const iconName = getLucideIconName(this.result.icon);
				iconInfo = {
					name: iconName,
					displayName: iconName,
					source: 'lucide',
					url: getLucideIconUrl(iconName),
				};
			} else if (isLocalIcon(this.result.icon)) {
				iconInfo = {
					name: this.result.icon.split('/').pop()?.replace('.svg', '') || '',
					displayName: this.result.icon.split('/').pop() || '',
					source: 'local',
					path: this.result.icon,
				};
			}
			
			// Use unified rendering for Lucide and local icons
			if (iconInfo) {
				(async () => {
					// Calculate icon color (explicit or from base + transformation)
					let iconColor = this.result.iconColor;
					if (!iconColor && this.settings) {
						const baseColor = await this.getBaseColor();
						if (baseColor) {
							iconColor = this.applyTransformation(baseColor, this.settings.iconColorTransformation);
						}
					}
					const iconElement = await renderIconAsSvg(iconInfo!, 16, iconColor, this.app);
					this.previewIcon.appendChild(iconElement);
				})().catch(console.error);
			} else if (this.result.icon && (this.result.icon.startsWith('http') || this.result.icon.startsWith('/'))) {
				const img = document.createElement('img');
				img.src = this.result.icon;
				img.alt = 'Preview';
				img.style.width = '16px';
				img.style.height = '16px';
				img.style.display = 'block';
				if (this.result.iconColor) {
					img.style.filter = getColorFilter(this.result.iconColor);
				}
				this.previewIcon.appendChild(img);
			}
		}

		// Update text and background colors
		// Use computed colors from base color + transformations if not explicitly set
		const previewText = previewContent.querySelector('.preview-text') as HTMLElement;
		if (previewText && this.settings) {
			// Get base color
			const baseColor = await this.getBaseColor();
			
			// Calculate folder color (explicit or from base + transformation)
			let folderColor = this.result.folderColor;
			if (!folderColor && baseColor) {
				folderColor = this.applyTransformation(baseColor, this.settings.folderColorTransformation);
			}
			
			if (folderColor) {
				const opacity = (this.settings?.folderColorOpacity ?? 100) / 100;
				const bgColor = this.hexToRgba(folderColor, opacity);
				previewContent.style.backgroundColor = bgColor;
			} else {
				previewContent.style.removeProperty('background-color');
			}
			
			// Calculate text color (explicit or from base + transformation)
			let textColor = this.result.textColor;
			if (!textColor && baseColor) {
				textColor = this.applyTransformation(baseColor, this.settings.textColorTransformation);
			}
			
			if (textColor) {
				previewText.style.color = textColor;
			} else {
				previewText.style.removeProperty('color');
			}
			
			// Icon color is applied when rendering the icon, so we don't need to set it here
		}
	}

	private hexToRgba(hex: string, opacity: number): string {
		// Remove # if present
		hex = hex.replace('#', '');
		
		// Parse hex
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		
		return `rgba(${r}, ${g}, ${b}, ${opacity})`;
	}


	onClose(): void {
		const { contentEl } = this;
		// Clear any pending search timeout
		if (this.searchTimeout !== null) {
			clearTimeout(this.searchTimeout);
			this.searchTimeout = null;
		}
		contentEl.empty();
	}
}
