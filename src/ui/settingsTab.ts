import { App, Modal, PluginSettingTab, Setting, Notice } from 'obsidian';
import { IconocolorPlugin } from '../main';
import { FolderConfig, ColorPalette, DefaultIconRule, ColorTransformation, ChildBaseTransformation, SettingsProfile } from '../types';
import { FolderConfigModal } from './folderConfigModal';
import { getInstalledIconPacks, deleteIconPack, IconPack } from '../utils/iconPackManager';
import { BrowsePacksModal } from './browsePacksModal';
import { applyHSLTransformation, applyLightnessTransformation, interpolateColor } from '../utils/colorUtils';

export class IconocolorSettingTab extends PluginSettingTab {
	plugin: IconocolorPlugin;

	constructor(app: App, plugin: IconocolorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.displayWithScrollPreservation();
	}

	/**
	 * Display settings while preserving scroll position
	 */
	private displayWithScrollPreservation(): void {
		const { containerEl } = this;

		// Save scroll position before emptying
		const settingsContainer = containerEl.closest('.vertical-tab-content') as HTMLElement;
		let savedScrollPosition = 0;
		if (settingsContainer) {
			savedScrollPosition = settingsContainer.scrollTop;
		}

		containerEl.empty();

		// General settings
		new Setting(containerEl)
			.setHeading()
			.setName('General');

		const iconSizeSetting = new Setting(containerEl)
			.setName('Icon size')
			.setDesc('Global size for all folder icons in pixels');
		
		let iconSizeTextInput: HTMLInputElement | null = null;
		let iconSizeSlider: HTMLInputElement | null = null;
		
		iconSizeSetting.addSlider(slider => {
			slider
				.setLimits(12, 32, 1)
				.setValue(this.plugin.settings.iconSize !== undefined ? this.plugin.settings.iconSize : 16)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.iconSize = value;
					// Update text input to match slider
					if (iconSizeTextInput) {
						iconSizeTextInput.value = String(value);
					}
					await this.plugin.saveSettings();
					this.plugin.folderManager.applyAllStyles();
				});
			// Store reference to slider element
			iconSizeSlider = slider.sliderEl;
		});
		
		iconSizeSetting.addText(text => {
			text
				.setValue(String(this.plugin.settings.iconSize !== undefined ? this.plugin.settings.iconSize : 16))
				.setPlaceholder('16')
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 12 && numValue <= 32) {
						this.plugin.settings.iconSize = numValue;
						// Update slider to match text input
						if (iconSizeSlider) {
							iconSizeSlider.value = String(numValue);
						}
						await this.plugin.saveSettings();
						this.plugin.folderManager.applyAllStyles();
					}
				});
			// Store reference to text input element
			iconSizeTextInput = text.inputEl;
		});

		const opacitySetting = new Setting(containerEl)
			.setName('Folder background opacity')
			.setDesc('Global opacity for folder background colors (0-100%). Only applies if a folder has a background color set.');
		
		let opacityTextInput: HTMLInputElement | null = null;
		let opacitySlider: HTMLInputElement | null = null;
		
		opacitySetting.addSlider(slider => {
			slider
				.setLimits(0, 100, 1)
				.setValue(this.plugin.settings.folderColorOpacity !== undefined ? this.plugin.settings.folderColorOpacity : 100)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.folderColorOpacity = value;
					// Update text input to match slider
					if (opacityTextInput) {
						opacityTextInput.value = String(value);
					}
					await this.plugin.saveSettings();
					this.plugin.folderManager.applyAllStyles();
				});
			// Store reference to slider element
			opacitySlider = slider.sliderEl;
		});
		
		opacitySetting.addText(text => {
			text
				.setValue(String(this.plugin.settings.folderColorOpacity !== undefined ? this.plugin.settings.folderColorOpacity : 100))
				.setPlaceholder('100')
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
						this.plugin.settings.folderColorOpacity = numValue;
						// Update slider to match text input
						if (opacitySlider) {
							opacitySlider.value = String(numValue);
						}
						await this.plugin.saveSettings();
						this.plugin.folderManager.applyAllStyles();
					}
				});
			// Store reference to text input element
			opacityTextInput = text.inputEl;
		});

		// Color Palettes section (moved up - foundation for colors)
		new Setting(containerEl)
			.setHeading()
			.setName('Color palettes');
		
		new Setting(containerEl)
			.setName('Active palette')
			.setDesc('Select which palette to use for quick selection and auto-coloring')
			.addDropdown(dropdown => {
				this.plugin.settings.colorPalettes.forEach((palette, index) => {
					dropdown.addOption(String(index), palette.name);
				});
				dropdown.setValue(String(this.plugin.settings.activePaletteIndex || 0));
				dropdown.onChange(async (value) => {
					this.plugin.settings.activePaletteIndex = parseInt(value, 10);
					await this.plugin.saveSettings();
					await this.plugin.folderManager.updateSettings(this.plugin.settings);
					this.displayWithScrollPreservation();
				});
			});

		// Palette list
		this.plugin.settings.colorPalettes.forEach((palette, index) => {
			const paletteSetting = new Setting(containerEl)
				.setName(palette.name)
				.setDesc(`${palette.colors.length} colors`);

			// Color swatches
			const colorContainer = paletteSetting.controlEl.createDiv();
			colorContainer.addClass('palette-colors');
			palette.colors.forEach(color => {
				const swatch = colorContainer.createDiv();
				swatch.addClass('color-swatch');
				swatch.style.backgroundColor = color;
				swatch.title = color;
			});

			// Edit button
			paletteSetting.addButton(button => {
				button
					.setButtonText('Edit')
					.onClick(() => {
						this.editPalette(index);
					});
			});

			// Delete button (if not the only palette)
			if (this.plugin.settings.colorPalettes.length > 1) {
				paletteSetting.addButton(button => {
					button
						.setButtonText('Delete')
						.onClick(async () => {
							this.plugin.settings.colorPalettes.splice(index, 1);
							if (this.plugin.settings.activePaletteIndex >= this.plugin.settings.colorPalettes.length) {
								this.plugin.settings.activePaletteIndex = 0;
							}
							await this.plugin.saveSettings();
							await this.plugin.folderManager.updateSettings(this.plugin.settings);
							this.displayWithScrollPreservation();
						});
				});
			}
		});

		// Add new palette button
		new Setting(containerEl)
			.addButton(button => {
				button
					.setButtonText('+ Add Palette')
					.setCta()
					.onClick(async () => {
						await this.addPalette();
					});
			});

		// Automatic base color assignment (uses palettes, so comes after)
		new Setting(containerEl)
			.setHeading()
			.setName('Automatic base color');

		new Setting(containerEl)
			.setName('Enable automatic base color')
			.setDesc('Automatically assign base colors to root-level folders from the active palette')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.autoColorEnabled || false)
					.onChange(async (value) => {
						this.plugin.settings.autoColorEnabled = value;
						await this.plugin.saveSettings();
						await this.plugin.folderManager.updateSettings(this.plugin.settings);
						this.displayWithScrollPreservation();
					});
			});

		if (this.plugin.settings.autoColorEnabled) {
			new Setting(containerEl)
				.setName('Color mode')
				.setDesc('How to apply colors: gradient creates smooth transitions, repeat cycles through palette')
				.addDropdown(dropdown => {
					dropdown.addOption('gradient', 'Gradient');
					dropdown.addOption('repeat', 'Repeat');
					dropdown.setValue(this.plugin.settings.autoColorMode || 'gradient');
					dropdown.onChange(async (value) => {
						this.plugin.settings.autoColorMode = value as 'gradient' | 'repeat';
						await this.plugin.saveSettings();
						await this.plugin.folderManager.updateSettings(this.plugin.settings);
						this.displayWithScrollPreservation();
					});
				});
		}

		// Global transformations section (how colors are derived from base)
		new Setting(containerEl)
			.setHeading()
			.setName('Color transformations');


		// Add preview for base transformations
		this.addBaseTransformationPreview(containerEl);
		
		// Icon color transformation
		this.addTransformationSetting(containerEl, 'Icon color', 'iconColorTransformation');
		
		// Folder color transformation
		this.addTransformationSetting(containerEl, 'Background color', 'folderColorTransformation');
		
		// Text color transformation
		this.addTransformationSetting(containerEl, 'Text color', 'textColorTransformation');

		// Child base transformation section (how children inherit)
		new Setting(containerEl)
			.setHeading()
			.setName('Child base transformation');

		// Add preview for child base transformations
		this.addChildBaseTransformationPreview(containerEl);
		
		this.addChildBaseTransformationSettings(containerEl);

		// Default Icons section
		new Setting(containerEl)
			.setHeading()
			.setName('Default icons');

		new Setting(containerEl)
			.setName('Enable default icons')
			.setDesc('Automatically apply icons to files and folders based on regex patterns')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.defaultIconRules?.length > 0 ? true : false)
					.onChange(async (value) => {
						if (!value && this.plugin.settings.defaultIconRules) {
							// Disable all rules
							this.plugin.settings.defaultIconRules.forEach(rule => rule.enabled = false);
						}
						await this.plugin.saveSettings();
						await this.plugin.folderManager.updateSettings(this.plugin.settings);
						this.displayWithScrollPreservation();
					});
			});

		// List default icon rules
		if (!this.plugin.settings.defaultIconRules) {
			this.plugin.settings.defaultIconRules = [];
		}

		this.plugin.settings.defaultIconRules.forEach((rule, index) => {
			const ruleSetting = new Setting(containerEl)
				.setName(rule.pattern || 'New rule')
				.setDesc(`Type: ${rule.type} | Icon: ${rule.icon}${rule.iconColor ? ` | Color: ${rule.iconColor}` : ''}`);

			ruleSetting.addToggle(toggle => {
				toggle
					.setValue(rule.enabled)
					.onChange(async (value) => {
						rule.enabled = value;
						await this.plugin.saveSettings();
						await this.plugin.folderManager.updateSettings(this.plugin.settings);
						this.displayWithScrollPreservation();
					});
			});

			ruleSetting.addButton(button => {
				button
					.setButtonText('Edit')
					.onClick(() => {
						this.editDefaultIconRule(index);
					});
			});

			ruleSetting.addButton(button => {
				button
					.setButtonText('Delete')
					.setWarning()
					.onClick(async () => {
							this.plugin.settings.defaultIconRules!.splice(index, 1);
							await this.plugin.saveSettings();
							await this.plugin.folderManager.updateSettings(this.plugin.settings);
							this.displayWithScrollPreservation();
					});
			});
		});

		// Add new rule button
		new Setting(containerEl)
			.addButton(button => {
				button
					.setButtonText('+ Add Rule')
					.setCta()
					.onClick(async () => {
						await this.addDefaultIconRule();
					});
			});

		// Icon Packs section
		new Setting(containerEl)
			.setHeading()
			.setName('Icon packs');

		new Setting(containerEl)
			.setName('Browse icon packs')
			.setDesc('Search and download from available icon packs. Icons are stored in .obsidian/icons/')
			.addButton(button => {
				button
					.setButtonText('Browse Packs')
					.setCta()
					.onClick(() => {
						new BrowsePacksModal(this.app, () => {
							this.displayWithScrollPreservation();
						}).open();
					});
			});
		const installedPacksPromise = getInstalledIconPacks(this.app);
		installedPacksPromise.then(installedPacks => {
			this.renderInstalledPacks(installedPacks.filter(p => p.installed));
		}).catch(console.error);

		// Configured folders section
		const folders = Object.keys(this.plugin.settings.folderConfigs);
		
		new Setting(containerEl)
			.setHeading()
			.setName('Configured folders');
		
		if (folders.length > 0) {
			for (const folderPath of folders) {
				const config = this.plugin.settings.folderConfigs[folderPath];
				
				const folderSetting = new Setting(containerEl)
					.setName(folderPath)
					.setDesc(this.getConfigDescription(config));

				folderSetting.addButton((button) => {
					button
						.setButtonText('Edit')
						.onClick(() => {
							this.editFolderConfig(folderPath, config);
						});
				});

				folderSetting.addButton((button) => {
					button
						.setButtonText('Remove')
						.onClick(async () => {
							await this.plugin.folderManager.removeFolderConfig(folderPath);
							this.displayWithScrollPreservation();
						});
				});
			}
		} else {
			new Setting(containerEl)
				.setName('No folders configured')
				.setDesc('Right-click on a folder in the file explorer to set its icon and colors.');
		}

		// Profile management (at the end - saves/loads all settings)
		this.addProfileManagementSettings(containerEl);

		// Restore scroll position after rendering
		if (savedScrollPosition > 0) {
			// Use requestAnimationFrame to ensure DOM is fully rendered
			requestAnimationFrame(() => {
				const currentSettingsContainer = containerEl.closest('.vertical-tab-content') as HTMLElement;
				if (currentSettingsContainer) {
					currentSettingsContainer.scrollTop = savedScrollPosition;
				}
			});
		}
	}

	private renderInstalledPacks(installedPacks: IconPack[]): void {
		const containerEl = this.containerEl;
		
		// Find the Icon Packs heading
		const iconPacksHeading = Array.from(containerEl.querySelectorAll('.setting-item-heading')).find(
			heading => heading.textContent === 'Icon packs'
		);
		
		if (!iconPacksHeading) return;
		
		// Find the Browse Packs setting
		const browseSetting = Array.from(containerEl.querySelectorAll('.setting-item')).find(
			setting => setting.querySelector('.setting-item-name')?.textContent === 'Browse icon packs'
		);
		
		if (installedPacks.length > 0) {
			for (const pack of installedPacks) {
				const packSetting = new Setting(containerEl)
					.setName(pack.name)
					.setDesc(pack.description || `Icon pack with ${pack.iconCount || 0} icons`);

				// Show icon count
				if (pack.iconCount !== undefined) {
					const countText = packSetting.descEl.createEl('span', {
						text: ` • ${pack.iconCount.toLocaleString()} icons`,
					});
					countText.style.fontWeight = 'bold';
				}

				packSetting.addButton(button => {
					button
						.setButtonText('Installed')
						.setDisabled(true);
				});

				// Delete button
				packSetting.addButton(button => {
					button
						.setButtonText('Delete')
						.setWarning()
						.onClick(async () => {
							const confirmed = confirm(`Are you sure you want to delete "${pack.name}"? This will remove all ${pack.iconCount || 0} icons from this pack.`);
							if (!confirmed) return;

							button.setButtonText('Deleting...');
							button.setDisabled(true);

							const result = await deleteIconPack(this.app, pack);
							if (result.success) {
								new Notice(`${pack.name} deleted successfully.`);
								this.displayWithScrollPreservation();
							} else {
								new Notice(`Failed to delete ${pack.name}: ${result.error || 'Unknown error'}`);
								button.setButtonText('Delete');
								button.setDisabled(false);
							}
						});
				});
				
				// Insert after browse setting
				if (browseSetting) {
					browseSetting.insertAdjacentElement('afterend', packSetting.settingEl);
				}
			}
		} else {
			const emptyMsg = new Setting(containerEl)
				.setName('No icon packs installed')
				.setDesc('Click "Browse Packs" above to download icon packs.');
			
			if (browseSetting) {
				browseSetting.insertAdjacentElement('afterend', emptyMsg.settingEl);
			}
		}
	}

	private getConfigDescription(config: FolderConfig): string {
		const parts: string[] = [];
		if (config.icon) parts.push('Icon: ✓');
		if (config.baseColor) parts.push('Base color: ✓');
		if (config.iconColor) parts.push('Icon color: ✓');
		if (config.folderColor) parts.push('Folder color: ✓');
		if (config.textColor) parts.push('Text color: ✓');
		if (config.applyToSubfolders) parts.push('Applies to subfolders');
		if (config.inheritBaseColor === false) parts.push('Children do not inherit');
		return parts.length > 0 ? parts.join(', ') : 'No configuration';
	}

	private async editFolderConfig(folderPath: string, currentConfig: FolderConfig): Promise<void> {
		new FolderConfigModal(
			this.app,
			currentConfig,
			this.plugin.settings,
			async (result) => {
				const config: FolderConfig = {
					...(result.icon !== undefined && { icon: result.icon }),
					...(result.baseColor !== undefined && { baseColor: result.baseColor }),
					...(result.iconColor !== undefined && { iconColor: result.iconColor }),
					...(result.folderColor !== undefined && { folderColor: result.folderColor }),
					...(result.textColor !== undefined && { textColor: result.textColor }),
					...(result.applyToSubfolders !== undefined && { applyToSubfolders: result.applyToSubfolders }),
					...(result.inheritBaseColor !== undefined && { inheritBaseColor: result.inheritBaseColor }),
				};

				await this.plugin.folderManager.setFolderConfig(folderPath, config);
				this.displayWithScrollPreservation(); // Refresh
			},
			folderPath
		).open();
	}

	private async addPalette(): Promise<void> {
		const newPalette: ColorPalette = {
			name: `Palette ${this.plugin.settings.colorPalettes.length + 1}`,
			colors: ['#FF6B6B', '#4ECDC4', '#45B7D1']
		};
		this.plugin.settings.colorPalettes.push(newPalette);
		await this.plugin.saveSettings();
		this.displayWithScrollPreservation();
	}

	private editPalette(index: number): void {
		const palette = this.plugin.settings.colorPalettes[index];
		
		class PaletteEditorModal extends Modal {
			palette: ColorPalette;
			onSubmit: (palette: ColorPalette) => void;

			constructor(app: App, palette: ColorPalette, onSubmit: (palette: ColorPalette) => void) {
				super(app);
				this.palette = { ...palette, colors: [...palette.colors] };
				this.onSubmit = onSubmit;
			}

			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl('h2', { text: 'Edit Palette' });

				// Name
				new Setting(contentEl)
					.setName('Palette name')
					.addText(text => {
						text.setValue(this.palette.name);
						text.onChange(value => {
							this.palette.name = value;
						});
					});

				// Colors
				contentEl.createEl('h3', { text: 'Colors' });
				const colorsContainer = contentEl.createDiv();
				colorsContainer.addClass('palette-editor-colors');

				const renderColors = () => {
					colorsContainer.empty();
					this.palette.colors.forEach((color, i) => {
						const colorSetting = new Setting(colorsContainer)
							.setName(`Color ${i + 1}`)
							.addText(text => {
								text.setValue(color);
								text.onChange(value => {
									this.palette.colors[i] = value;
									renderColors();
								});
							})
							.addButton(button => {
								button.setButtonText('Remove');
								button.onClick(() => {
									this.palette.colors.splice(i, 1);
									renderColors();
								});
							});
					});
				};

				renderColors();

				// Add color button
				new Setting(contentEl)
					.addButton(button => {
						button.setButtonText('+ Add Color');
						button.onClick(() => {
							this.palette.colors.push('#000000');
							renderColors();
						});
					});

				// Buttons
				new Setting(contentEl)
					.addButton(button => {
						button.setButtonText('Cancel');
						button.onClick(() => this.close());
					})
					.addButton(button => {
						button.setButtonText('Save');
						button.setCta();
						button.onClick(() => {
							this.onSubmit(this.palette);
							this.close();
						});
					});
			}

			onClose(): void {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		new PaletteEditorModal(
			this.app,
			palette,
			async (editedPalette) => {
				this.plugin.settings.colorPalettes[index] = editedPalette;
				await this.plugin.saveSettings();
				await this.plugin.folderManager.updateSettings(this.plugin.settings);
				this.displayWithScrollPreservation();
			}
		).open();
	}

	private async addDefaultIconRule(): Promise<void> {
		if (!this.plugin.settings.defaultIconRules) {
			this.plugin.settings.defaultIconRules = [];
		}

		const newRule: DefaultIconRule = {
			id: `rule-${Date.now()}`,
			pattern: '',
			type: 'folder',
			icon: '',
			enabled: true,
		};

		this.plugin.settings.defaultIconRules.push(newRule);
		await this.plugin.saveSettings();
		this.editDefaultIconRule(this.plugin.settings.defaultIconRules.length - 1);
	}

	private editDefaultIconRule(index: number): void {
		if (!this.plugin.settings.defaultIconRules || !this.plugin.settings.defaultIconRules[index]) {
			return;
		}

		const rule = this.plugin.settings.defaultIconRules[index];
		
		class DefaultIconRuleModal extends Modal {
			rule: DefaultIconRule;
			onSubmit: (rule: DefaultIconRule) => void;

			constructor(app: App, rule: DefaultIconRule, onSubmit: (rule: DefaultIconRule) => void) {
				super(app);
				this.rule = { ...rule };
				this.onSubmit = onSubmit;
			}

			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl('h2', { text: 'Default Icon Rule' });

				// Pattern (regex)
				new Setting(contentEl)
					.setName('Pattern (regex)')
					.setDesc('Regular expression to match file or folder names')
					.addText(text => {
						text.setValue(this.rule.pattern);
						text.setPlaceholder('e.g., ^Archive|^Assets')
						text.onChange(value => {
							this.rule.pattern = value;
						});
					});

				// Type
				new Setting(contentEl)
					.setName('Type')
					.setDesc('Type of item to match: base (files), markdown (markdown files), or folder')
					.addDropdown(dropdown => {
						dropdown
							.addOption('base', 'Base (files)')
							.addOption('markdown', 'Markdown files')
							.addOption('folder', 'Folders');
						dropdown.setValue(this.rule.type);
						dropdown.onChange(value => {
							this.rule.type = value as 'base' | 'markdown' | 'folder';
						});
					});

				// Icon
				new Setting(contentEl)
					.setName('Icon')
					.setDesc('Icon path or name (e.g., "lucide:folder", "lucide:file", or path to icon file)')
					.addText(text => {
						text.setValue(this.rule.icon);
						text.setPlaceholder('e.g., lucide:folder')
						text.onChange(value => {
							this.rule.icon = value;
						});
					});

				// Icon color (optional)
				new Setting(contentEl)
					.setName('Icon color (optional)')
					.setDesc('Hex color for the icon (e.g., #FF0000). Leave empty to use default.')
					.addText(text => {
						text.setValue(this.rule.iconColor || '');
						text.setPlaceholder('#FF0000')
						text.onChange(value => {
							this.rule.iconColor = value.trim() || undefined;
						});
					});

				// Enabled toggle
				new Setting(contentEl)
					.setName('Enabled')
					.setDesc('Whether this rule is active')
					.addToggle(toggle => {
						toggle.setValue(this.rule.enabled);
						toggle.onChange(value => {
							this.rule.enabled = value;
						});
					});

				// Buttons
				new Setting(contentEl)
					.addButton(button => {
						button.setButtonText('Cancel');
						button.onClick(() => this.close());
					})
					.addButton(button => {
						button.setButtonText('Save');
						button.setCta();
						button.onClick(() => {
							if (!this.rule.pattern || !this.rule.icon) {
								new Notice('Pattern and icon are required.');
								return;
							}
							// Validate regex
							try {
								new RegExp(this.rule.pattern);
							} catch (e) {
								new Notice('Invalid regex pattern.');
								return;
							}
							this.onSubmit(this.rule);
							this.close();
						});
					});
			}

			onClose(): void {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		new DefaultIconRuleModal(
			this.app,
			rule,
			async (editedRule) => {
						this.plugin.settings.defaultIconRules![index] = editedRule;
						await this.plugin.saveSettings();
						await this.plugin.folderManager.updateSettings(this.plugin.settings);
						this.displayWithScrollPreservation();
					}
				).open();
	}

	/**
	 * Add preview showing how base color transforms into element colors
	 */
	private addBaseTransformationPreview(containerEl: HTMLElement): void {
		// Sample base color (use first color from active palette)
		const activePalette = this.plugin.settings.colorPalettes[this.plugin.settings.activePaletteIndex || 0];
		const sampleBaseColor = activePalette?.colors[0] || '#4ECDC4';
		
		const previewSetting = new Setting(containerEl)
			.setName('Preview: Base Color → Element Colors')
			.setDesc('');
		
		// Remove the description element to make it cleaner
		const descEl = previewSetting.descEl;
		if (descEl) {
			descEl.remove();
		}
		
		const previewContent = previewSetting.controlEl;
		previewContent.style.display = 'flex';
		previewContent.style.alignItems = 'center';
		previewContent.style.gap = '8px';
		previewContent.style.flexWrap = 'wrap';
		previewContent.style.width = '100%';
		
		// Base color swatch
		const baseSwatch = previewContent.createDiv();
		baseSwatch.style.display = 'flex';
		baseSwatch.style.flexDirection = 'column';
		baseSwatch.style.alignItems = 'center';
		baseSwatch.style.gap = '3px';
		
		const baseColorBox = baseSwatch.createDiv();
		baseColorBox.style.width = '36px';
		baseColorBox.style.height = '36px';
		baseColorBox.style.borderRadius = '4px';
		baseColorBox.style.border = '1px solid var(--background-modifier-border)';
		baseColorBox.style.backgroundColor = sampleBaseColor;
		baseColorBox.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
		
		const baseLabel = baseSwatch.createEl('span', { text: 'Base' });
		baseLabel.style.fontSize = '9px';
		baseLabel.style.color = 'var(--text-muted)';
		
		const baseColorValue = baseSwatch.createEl('span', { text: sampleBaseColor });
		baseColorValue.style.fontSize = '8px';
		baseColorValue.style.fontFamily = 'var(--font-monospace)';
		baseColorValue.style.color = 'var(--text-faint)';
		
		// Arrow
		const arrow = previewContent.createEl('span', { text: '→' });
		arrow.style.fontSize = '16px';
		arrow.style.color = 'var(--text-muted)';
		
		// Transformed colors
		const transformedContainer = previewContent.createDiv();
		transformedContainer.style.display = 'flex';
		transformedContainer.style.gap = '6px';
		transformedContainer.style.flexWrap = 'wrap';
		
		const updatePreview = () => {
			transformedContainer.empty();
			
			// Icon color
			const iconColor = this.applyTransformation(sampleBaseColor, this.plugin.settings.iconColorTransformation);
			this.addColorPreview(transformedContainer, 'Icon', iconColor, '🎨');
			
			// Folder color
			const folderColor = this.applyTransformation(sampleBaseColor, this.plugin.settings.folderColorTransformation);
			this.addColorPreview(transformedContainer, 'Background', folderColor, '📁');
			
			// Text color
			const textColor = this.applyTransformation(sampleBaseColor, this.plugin.settings.textColorTransformation);
			this.addColorPreview(transformedContainer, 'Text', textColor, 'Aa');
		};
		
		updatePreview();
		
		// Store update function for later use
		(previewSetting.settingEl as any).updatePreview = updatePreview;
	}
	
	/**
	 * Add a color preview box
	 */
	private addColorPreview(container: HTMLElement, label: string, color: string, icon: string): void {
		const preview = container.createDiv();
		preview.style.display = 'flex';
		preview.style.flexDirection = 'column';
		preview.style.alignItems = 'center';
		preview.style.gap = '3px';
		
		const colorBox = preview.createDiv();
		colorBox.style.width = '36px';
		colorBox.style.height = '36px';
		colorBox.style.borderRadius = '4px';
		colorBox.style.border = '1px solid var(--background-modifier-border)';
		colorBox.style.backgroundColor = color;
		colorBox.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
		colorBox.style.display = 'flex';
		colorBox.style.alignItems = 'center';
		colorBox.style.justifyContent = 'center';
		colorBox.style.fontSize = '14px';
		
		const labelEl = preview.createEl('span', { text: label });
		labelEl.style.fontSize = '9px';
		labelEl.style.color = 'var(--text-muted)';
		
		const colorValue = preview.createEl('span', { text: color });
		colorValue.style.fontSize = '8px';
		colorValue.style.fontFamily = 'var(--font-monospace)';
		colorValue.style.color = 'var(--text-faint)';
	}
	
	/**
	 * Update all previews in the settings
	 */
	private updateAllPreviews(): void {
		// Find previews by checking for updatePreview function on setting elements
		const allSettings = this.containerEl.querySelectorAll('.setting-item');
		allSettings.forEach(setting => {
			if ((setting as any).updatePreview) {
				(setting as any).updatePreview();
			}
		});
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
	
	/**
	 * Add preview showing how child base colors are derived from parent
	 */
	private addChildBaseTransformationPreview(containerEl: HTMLElement): void {
		// Sample parent color
		const activePalette = this.plugin.settings.colorPalettes[this.plugin.settings.activePaletteIndex || 0];
		const parentColor = activePalette?.colors[0] || '#4ECDC4';
		const nextSiblingColor = activePalette?.colors[1] || '#45B7D1';
		
		const previewSetting = new Setting(containerEl)
			.setName('Preview: Parent → Child Colors')
			.setDesc('');
		
		// Remove the description element to make it cleaner
		const descEl = previewSetting.descEl;
		if (descEl) {
			descEl.remove();
		}
		
		const previewContent = previewSetting.controlEl;
		previewContent.style.display = 'flex';
		previewContent.style.alignItems = 'center';
		previewContent.style.gap = '8px';
		previewContent.style.flexWrap = 'wrap';
		previewContent.style.width = '100%';
		
		// Parent color (static)
		const parentSwatch = previewContent.createDiv();
		parentSwatch.style.display = 'flex';
		parentSwatch.style.flexDirection = 'column';
		parentSwatch.style.alignItems = 'center';
		parentSwatch.style.gap = '3px';
		
		const parentBox = parentSwatch.createDiv();
		parentBox.style.width = '36px';
		parentBox.style.height = '36px';
		parentBox.style.borderRadius = '4px';
		parentBox.style.border = '1px solid var(--background-modifier-border)';
		parentBox.style.backgroundColor = parentColor;
		parentBox.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
		
		const parentLabel = parentSwatch.createEl('span', { text: 'Parent' });
		parentLabel.style.fontSize = '9px';
		parentLabel.style.color = 'var(--text-muted)';
		
		const parentColorValue = parentSwatch.createEl('span', { text: parentColor });
		parentColorValue.style.fontSize = '8px';
		parentColorValue.style.fontFamily = 'var(--font-monospace)';
		parentColorValue.style.color = 'var(--text-faint)';
		
		// Arrow (static)
		const arrow = previewContent.createEl('span', { text: '→' });
		arrow.style.fontSize = '16px';
		arrow.style.color = 'var(--text-muted)';
		
		// Child colors container (will be updated)
		const childContainer = previewContent.createDiv();
		childContainer.style.display = 'flex';
		childContainer.style.gap = '6px';
		childContainer.style.flexWrap = 'wrap';
		
		const updatePreview = () => {
			childContainer.empty();
			
			const transformation = this.plugin.settings.childBaseTransformation;
			
			// Skip if no inheritance
			if (transformation.type === 'none') {
				return;
			}
			
			// Generate 3 child colors showing consecutive/cumulative transformations
			// Ignore gradient setting - just show pure consecutive transformations
			let currentColor = parentColor;
			
			for (let i = 0; i < 3; i++) {
				// Each child applies transformation to previous child's result (cumulative)
				let childBaseColor = currentColor;
				
				if (transformation.type === 'hsl') {
					childBaseColor = applyHSLTransformation(childBaseColor, {
						hue: transformation.hue || 0,
						saturation: transformation.saturation || 0,
						lightness: transformation.lightness || 0,
					});
				} else if (transformation.type === 'lightness' && transformation.adjustment !== undefined) {
					childBaseColor = applyLightnessTransformation(childBaseColor, transformation.adjustment);
				}
				
				// Update current for next iteration (cumulative effect)
				currentColor = childBaseColor;
				
				const childSwatch = childContainer.createDiv();
				childSwatch.style.display = 'flex';
				childSwatch.style.flexDirection = 'column';
				childSwatch.style.alignItems = 'center';
				childSwatch.style.gap = '3px';
				
				const childBox = childSwatch.createDiv();
				childBox.style.width = '36px';
				childBox.style.height = '36px';
				childBox.style.borderRadius = '4px';
				childBox.style.border = '1px solid var(--background-modifier-border)';
				childBox.style.backgroundColor = childBaseColor;
				childBox.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
				
				const childLabel = childSwatch.createEl('span', { text: `C${i + 1}` });
				childLabel.style.fontSize = '9px';
				childLabel.style.color = 'var(--text-muted)';
				
				const childColorValue = childSwatch.createEl('span', { text: childBaseColor });
				childColorValue.style.fontSize = '8px';
				childColorValue.style.fontFamily = 'var(--font-monospace)';
				childColorValue.style.color = 'var(--text-faint)';
			}
		};
		
		updatePreview();
		
		// Store update function for later use
		(previewSetting.settingEl as any).updatePreview = updatePreview;
	}

	/**
	 * Add transformation setting UI
	 */
	private addTransformationSetting(containerEl: HTMLElement, label: string, settingKey: 'iconColorTransformation' | 'folderColorTransformation' | 'textColorTransformation'): void {
		const current = this.plugin.settings[settingKey] || { type: 'none' };
		
		new Setting(containerEl)
			.setName(`${label} transformation`)
			.setDesc('How this color is derived from base color')
			.addDropdown(dropdown => {
				dropdown
					.addOption('none', 'None (same as base)')
					.addOption('lightness', 'Lightness adjustment')
					.addOption('hsl', 'HSL transformation');
				dropdown.setValue(current.type);
				dropdown.onChange(async (value) => {
					if (value === 'none') {
						this.plugin.settings[settingKey] = { type: 'none' };
					} else if (value === 'lightness') {
						this.plugin.settings[settingKey] = {
							type: 'lightness',
							adjustment: (current.type === 'lightness' && current.adjustment !== undefined) ? current.adjustment : 0
						};
					} else if (value === 'hsl') {
						this.plugin.settings[settingKey] = {
							type: 'hsl',
							hue: (current.type === 'hsl' && current.hue !== undefined) ? current.hue : 0,
							saturation: (current.type === 'hsl' && current.saturation !== undefined) ? current.saturation : 0,
							lightness: (current.type === 'hsl' && current.lightness !== undefined) ? current.lightness : 0
						};
					}
					await this.plugin.saveSettings();
					await this.plugin.folderManager.updateSettings(this.plugin.settings);
					this.updateAllPreviews();
					this.display();
				});
			});

		// Show additional inputs based on type
		if (current.type === 'lightness') {
			new Setting(containerEl)
				.setName(`${label} lightness adjustment`)
				.setDesc('Percentage: positive = lighter, negative = darker (-100 to 100)')
				.addText(text => {
					text.setPlaceholder('0')
						.setValue(current.adjustment !== undefined ? String(current.adjustment) : '0')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 0 : parseFloat(value);
							if (!isNaN(numValue)) {
								(this.plugin.settings[settingKey] as any).adjustment = Math.max(-100, Math.min(100, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});
		} else if (current.type === 'hsl') {
			new Setting(containerEl)
				.setName(`${label} hue shift`)
				.setDesc('Hue shift in degrees (-180 to 180)')
				.addText(text => {
					text.setPlaceholder('0')
						.setValue(current.hue !== undefined ? String(current.hue) : '0')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 0 : parseFloat(value);
							if (!isNaN(numValue)) {
								(this.plugin.settings[settingKey] as any).hue = Math.max(-180, Math.min(180, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});

			new Setting(containerEl)
				.setName(`${label} saturation adjustment`)
				.setDesc('Saturation adjustment in percentage (-100 to 100)')
				.addText(text => {
					text.setPlaceholder('0')
						.setValue(current.saturation !== undefined ? String(current.saturation) : '0')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 0 : parseFloat(value);
							if (!isNaN(numValue)) {
								(this.plugin.settings[settingKey] as any).saturation = Math.max(-100, Math.min(100, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});

			new Setting(containerEl)
				.setName(`${label} lightness adjustment`)
				.setDesc('Lightness adjustment in percentage (-100 to 100)')
				.addText(text => {
					text.setPlaceholder('0')
						.setValue(current.lightness !== undefined ? String(current.lightness) : '0')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 0 : parseFloat(value);
							if (!isNaN(numValue)) {
								(this.plugin.settings[settingKey] as any).lightness = Math.max(-100, Math.min(100, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});
		}
	}

	/**
	 * Add child base transformation settings
	 */
	private addChildBaseTransformationSettings(containerEl: HTMLElement): void {
		const current = this.plugin.settings.childBaseTransformation || { type: 'lightness', adjustment: 10, backgroundOpacity: 100 };
		
		new Setting(containerEl)
			.setName('Transformation type')
			.setDesc('How child base color is derived from parent base color')
			.addDropdown(dropdown => {
				dropdown
					.addOption('none', 'None (no inheritance)')
					.addOption('lightness', 'Lightness adjustment')
					.addOption('hsl', 'HSL transformation');
				dropdown.setValue(current.type || 'lightness');
				dropdown.onChange(async (value) => {
					if (value === 'none') {
						this.plugin.settings.childBaseTransformation = {
							type: 'none',
						};
					} else if (value === 'lightness') {
						this.plugin.settings.childBaseTransformation = {
							type: 'lightness',
							adjustment: (current.type === 'lightness' && current.adjustment !== undefined) ? current.adjustment : 10,
							useGradient: current.useGradient !== undefined ? current.useGradient : false,
							backgroundOpacity: current.backgroundOpacity !== undefined ? current.backgroundOpacity : 100
						};
					} else if (value === 'hsl') {
						this.plugin.settings.childBaseTransformation = {
							type: 'hsl',
							hue: (current.type === 'hsl' && current.hue !== undefined) ? current.hue : 0,
							saturation: (current.type === 'hsl' && current.saturation !== undefined) ? current.saturation : 0,
							lightness: (current.type === 'hsl' && current.lightness !== undefined) ? current.lightness : 10,
							useGradient: current.useGradient !== undefined ? current.useGradient : false,
							backgroundOpacity: current.backgroundOpacity !== undefined ? current.backgroundOpacity : 100
						};
					}
					await this.plugin.saveSettings();
					await this.plugin.folderManager.updateSettings(this.plugin.settings);
					this.updateAllPreviews();
					this.displayWithScrollPreservation();
				});
			});

		// Only show transformation options if type is not 'none'
		if (current.type !== 'none') {
			// Gradient toggle
			new Setting(containerEl)
				.setName('Use gradient')
				.setDesc('Interpolate between parent and next sibling before applying transformation. Gradient automatically distributes across all children.')
				.addToggle(toggle => {
					toggle
						.setValue(current.useGradient !== undefined ? current.useGradient : false)
						.onChange(async (value) => {
							this.plugin.settings.childBaseTransformation.useGradient = value;
							await this.plugin.saveSettings();
							await this.plugin.folderManager.updateSettings(this.plugin.settings);
							this.updateAllPreviews();
							this.displayWithScrollPreservation();
						});
				});

			if (current.type === 'lightness') {
			new Setting(containerEl)
				.setName('Lightness adjustment')
				.setDesc('Percentage: positive = lighter, negative = darker (-100 to 100)')
				.addText(text => {
					text.setPlaceholder('10')
						.setValue(current.adjustment !== undefined ? String(current.adjustment) : '10')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 10 : parseFloat(value);
							if (!isNaN(numValue)) {
								this.plugin.settings.childBaseTransformation.adjustment = Math.max(-100, Math.min(100, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});
		} else if (current.type === 'hsl') {
			new Setting(containerEl)
				.setName('Hue shift')
				.setDesc('Hue shift in degrees (-180 to 180)')
				.addText(text => {
					text.setPlaceholder('0')
						.setValue(current.hue !== undefined ? String(current.hue) : '0')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 0 : parseFloat(value);
							if (!isNaN(numValue)) {
								this.plugin.settings.childBaseTransformation.hue = Math.max(-180, Math.min(180, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});

			new Setting(containerEl)
				.setName('Saturation adjustment')
				.setDesc('Saturation adjustment in percentage (-100 to 100)')
				.addText(text => {
					text.setPlaceholder('0')
						.setValue(current.saturation !== undefined ? String(current.saturation) : '0')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 0 : parseFloat(value);
							if (!isNaN(numValue)) {
								this.plugin.settings.childBaseTransformation.saturation = Math.max(-100, Math.min(100, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});

			new Setting(containerEl)
				.setName('Lightness adjustment')
				.setDesc('Lightness adjustment in percentage (-100 to 100)')
				.addText(text => {
					text.setPlaceholder('10')
						.setValue(current.lightness !== undefined ? String(current.lightness) : '10')
						.onChange(async (value) => {
							const numValue = value.trim() === '' ? 10 : parseFloat(value);
							if (!isNaN(numValue)) {
								this.plugin.settings.childBaseTransformation.lightness = Math.max(-100, Math.min(100, numValue));
								await this.plugin.saveSettings();
								await this.plugin.folderManager.updateSettings(this.plugin.settings);
								this.updateAllPreviews();
							}
						});
				});
			}
		}

		// Background opacity
		new Setting(containerEl)
			.setName('Background opacity')
			.setDesc('Opacity for child folder backgrounds (0-100, 0 = fully transparent, 100 = fully opaque)')
			.addSlider(slider => {
				slider
					.setLimits(0, 100, 1)
					.setValue(current.backgroundOpacity !== undefined ? current.backgroundOpacity : 100)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.childBaseTransformation.backgroundOpacity = value;
						await this.plugin.saveSettings();
						this.plugin.folderManager.applyAllStyles();
						this.updateAllPreviews();
					});
			})
			.addText(text => {
				text
					.setValue(String(current.backgroundOpacity !== undefined ? current.backgroundOpacity : 100))
					.setPlaceholder('100')
					.onChange(async (value) => {
						const numValue = parseInt(value, 10);
						if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
							this.plugin.settings.childBaseTransformation.backgroundOpacity = numValue;
							await this.plugin.saveSettings();
							this.plugin.folderManager.applyAllStyles();
							this.updateAllPreviews();
						}
					});
			});
	}

	/**
	 * Add profile management section
	 */
	private addProfileManagementSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setHeading()
			.setName('Settings Profiles');

		// Current profile indicator
		if (this.plugin.settings.activeProfileId) {
			const activeProfile = this.plugin.settings.profiles?.find(p => p.id === this.plugin.settings.activeProfileId);
			if (activeProfile) {
				new Setting(containerEl)
					.setName('Active profile')
					.setDesc(`Currently using profile: ${activeProfile.name}`)
					.addButton(button => {
						button
							.setButtonText('Clear profile')
							.setCta()
							.onClick(async () => {
							this.plugin.settings.activeProfileId = undefined;
							await this.plugin.saveSettings();
							this.displayWithScrollPreservation();
						});
					});
			}
		}

		// Profile list
		const profiles = this.plugin.settings.profiles || [];
		if (profiles.length > 0) {
			profiles.forEach(profile => {
				const profileSetting = new Setting(containerEl)
					.setName(profile.name)
					.setDesc(this.plugin.settings.activeProfileId === profile.id ? 'Active' : 'Inactive')
					.addButton(button => {
						button
							.setButtonText('Load')
							.setCta()
							.onClick(async () => {
								await this.loadProfile(profile.id);
							});
					})
					.addButton(button => {
						button
							.setButtonText('Delete')
							.onClick(async () => {
								await this.deleteProfile(profile.id);
							});
					});
			});
		}

		// Create new profile
		new Setting(containerEl)
			.setName('Create profile')
			.setDesc('Save current settings as a new profile')
			.addText(text => {
				text.setPlaceholder('Profile name');
				text.inputEl.onkeydown = async (e) => {
					if (e.key === 'Enter') {
						const name = text.getValue().trim();
						if (name) {
							await this.createProfile(name);
							text.setValue('');
							this.displayWithScrollPreservation();
						}
					}
				};
			})
			.addButton(button => {
				button
					.setButtonText('Create')
					.setCta()
					.onClick(async () => {
						const nameInput = containerEl.querySelector('input[placeholder="Profile name"]') as HTMLInputElement;
						if (nameInput && nameInput.value.trim()) {
							await this.createProfile(nameInput.value.trim());
							nameInput.value = '';
							this.displayWithScrollPreservation();
						}
					});
			});
	}

	/**
	 * Create a new profile from current settings
	 */
	private async createProfile(name: string): Promise<void> {
		if (!this.plugin.settings.profiles) {
			this.plugin.settings.profiles = [];
		}

		// Helper function for deep cloning (only when needed)
		const deepClone = <T>(obj: T): T => {
			if (obj === null || typeof obj !== 'object') return obj;
			if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
			if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;
			const cloned = {} as T;
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					cloned[key] = deepClone(obj[key]);
				}
			}
			return cloned;
		};

		const profile: SettingsProfile = {
			id: `profile-${Date.now()}`,
			name: name,
			iconSize: this.plugin.settings.iconSize,
			activePaletteIndex: this.plugin.settings.activePaletteIndex,
			autoColorEnabled: this.plugin.settings.autoColorEnabled,
			autoColorMode: this.plugin.settings.autoColorMode,
			iconColorTransformation: deepClone(this.plugin.settings.iconColorTransformation),
			folderColorTransformation: deepClone(this.plugin.settings.folderColorTransformation),
			textColorTransformation: deepClone(this.plugin.settings.textColorTransformation),
			childBaseTransformation: deepClone(this.plugin.settings.childBaseTransformation),
			folderColorOpacity: this.plugin.settings.folderColorOpacity,
			defaultIconRules: deepClone(this.plugin.settings.defaultIconRules || []),
		};

		this.plugin.settings.profiles.push(profile);
		await this.plugin.saveSettings();
		new Notice(`Profile "${name}" created`);
	}

	/**
	 * Load a profile
	 */
	private async loadProfile(profileId: string): Promise<void> {
		const profile = this.plugin.settings.profiles?.find(p => p.id === profileId);
		if (!profile) {
			new Notice('Profile not found');
			return;
		}

		// Helper function for deep cloning (only when needed)
		const deepClone = <T>(obj: T): T => {
			if (obj === null || typeof obj !== 'object') return obj;
			if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
			if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;
			const cloned = {} as T;
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					cloned[key] = deepClone(obj[key]);
				}
			}
			return cloned;
		};

		// Apply profile settings
		// Note: colorPalettes are NOT loaded from profiles - they remain global
		if (profile.iconSize !== undefined) this.plugin.settings.iconSize = profile.iconSize;
		if (profile.activePaletteIndex !== undefined) this.plugin.settings.activePaletteIndex = profile.activePaletteIndex;
		if (profile.autoColorEnabled !== undefined) this.plugin.settings.autoColorEnabled = profile.autoColorEnabled;
		if (profile.autoColorMode) this.plugin.settings.autoColorMode = profile.autoColorMode;
		if (profile.iconColorTransformation) this.plugin.settings.iconColorTransformation = deepClone(profile.iconColorTransformation);
		if (profile.folderColorTransformation) this.plugin.settings.folderColorTransformation = deepClone(profile.folderColorTransformation);
		if (profile.textColorTransformation) this.plugin.settings.textColorTransformation = deepClone(profile.textColorTransformation);
		if (profile.childBaseTransformation) this.plugin.settings.childBaseTransformation = deepClone(profile.childBaseTransformation);
		if (profile.folderColorOpacity !== undefined) this.plugin.settings.folderColorOpacity = profile.folderColorOpacity;
		if (profile.defaultIconRules) this.plugin.settings.defaultIconRules = deepClone(profile.defaultIconRules);

		this.plugin.settings.activeProfileId = profileId;
		await this.plugin.saveSettings();
		await this.plugin.folderManager.updateSettings(this.plugin.settings);
		new Notice(`Profile "${profile.name}" loaded`);
		this.displayWithScrollPreservation();
	}

	/**
	 * Delete a profile
	 */
	private async deleteProfile(profileId: string): Promise<void> {
		const profile = this.plugin.settings.profiles?.find(p => p.id === profileId);
		if (!profile) {
			new Notice('Profile not found');
			return;
		}

		this.plugin.settings.profiles = this.plugin.settings.profiles?.filter(p => p.id !== profileId) || [];
		if (this.plugin.settings.activeProfileId === profileId) {
			this.plugin.settings.activeProfileId = undefined;
		}
		await this.plugin.saveSettings();
		new Notice(`Profile "${profile.name}" deleted`);
		this.displayWithScrollPreservation();
	}
}

