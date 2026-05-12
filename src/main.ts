import { Plugin, TFolder, Modal, Notice, App } from 'obsidian';
import { IconocolorSettings, FolderConfig, SettingsProfile, FolderConfigWithDeletions, ColorPalette } from './types';
import { DEFAULT_SETTINGS } from './settings';
import { FolderManager } from './folderManager';
import { IconocolorSettingTab } from './ui/settingsTab';
import { FolderConfigModal } from './ui/folderConfigModal';

// Minimal shape of Obsidian's undocumented `app.setting` object; only the
// fields we use are declared so we get type safety without depending on
// internals beyond what's needed.
interface SettingApi {
	open(): void;
	openTabById(id: string): void;
}
interface AppWithSetting extends App {
	setting: SettingApi;
}

export default class IconocolorPlugin extends Plugin {
	settings: IconocolorSettings;
	folderManager: FolderManager;

	async onload() {
		await this.loadSettings();

		// Initialize folder manager
		this.folderManager = new FolderManager(this, this.settings);
		this.folderManager.initialize();

		// Register context menu for folders
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, abstractFile) => {
				// Check if it's a folder (TFolder)
				if (abstractFile instanceof TFolder) {
					const folderPath = abstractFile.path;
					
					menu.addItem(item => {
						item
							.setTitle('Set icon and colors')
							.setIcon('palette')
							.onClick(() => {
								this.openFolderConfigModal(folderPath);
							});
					});

					// Check if folder has config
					const config = this.settings.folderConfigs[folderPath];
					if (config) {
						menu.addItem(item => {
							item
								.setTitle('Remove icon and colors')
								.setIcon('trash')
								.onClick(async () => {
									try {
										await this.folderManager.removeFolderConfig(folderPath);
									} catch (error) {
										new Notice(`Failed to remove folder configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
									}
								});
						});
					}
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new IconocolorSettingTab(this.app, this));

		this.addCommand({
			id: 'open-settings',
			name: 'Open settings',
			callback: () => {
				const appWithSetting = this.app as AppWithSetting;
				appWithSetting.setting.open();
				appWithSetting.setting.openTabById(this.manifest.id);
			},
		});

		this.addCommand({
			id: 'switch-profile',
			name: 'Switch profile',
			callback: () => {
				const profiles = this.settings.profiles || [];
				if (profiles.length === 0) {
					new Notice('No profiles available. Create a profile in settings first.');
					return;
				}

				const modal = new ProfileSwitchModal(this.app, profiles, (profileId: string) => {
					void this.loadProfile(profileId);
				});
				modal.open();
			},
		});

		this.addCommand({
			id: 'switch-color-palette',
			name: 'Switch color palette',
			callback: () => {
				const palettes = this.settings.colorPalettes || [];
				if (palettes.length === 0) {
					new Notice('No color palettes available. Create one in settings first.');
					return;
				}

				const modal = new PaletteSwitchModal(
					this.app,
					palettes,
					this.settings.activePaletteIndex ?? 0,
					(index: number) => {
						void this.setActivePalette(index);
					},
				);
				modal.open();
			},
		});
	}

	/**
	 * Switch to a color palette by index. Public so the palette-switch
	 * command can call it.
	 */
	async setActivePalette(index: number): Promise<void> {
		const palettes = this.settings.colorPalettes || [];
		const palette = palettes[index];
		if (!palette) {
			new Notice('Color palette not found');
			return;
		}
		this.settings.activePaletteIndex = index;
		await this.saveSettings();
		await this.folderManager.updateSettings(this.settings);
		new Notice(`Palette "${palette.name}" applied`);
	}

	/**
	 * Load a profile (public method for command palette)
	 */
	async loadProfile(profileId: string): Promise<void> {
		const profile = this.settings.profiles?.find(p => p.id === profileId);
		if (!profile) {
			new Notice('Profile not found');
			return;
		}

		// Use the platform's structured clone (available in Obsidian's Electron
		// runtime and all supported mobile browsers) to deep clone profile data.
		const deepClone = <T>(value: T): T => structuredClone(value);

		// Apply profile settings
		// Note: colorPalettes are NOT loaded from profiles - they remain global
		if (profile.iconSize !== undefined) this.settings.iconSize = profile.iconSize;
		if (profile.activePaletteIndex !== undefined) this.settings.activePaletteIndex = profile.activePaletteIndex;
		if (profile.autoColorEnabled !== undefined) this.settings.autoColorEnabled = profile.autoColorEnabled;
		if (profile.autoColorMode) this.settings.autoColorMode = profile.autoColorMode;
		if (profile.iconColorTransformation) this.settings.iconColorTransformation = deepClone(profile.iconColorTransformation);
		if (profile.folderColorTransformation) this.settings.folderColorTransformation = deepClone(profile.folderColorTransformation);
		if (profile.textColorTransformation) this.settings.textColorTransformation = deepClone(profile.textColorTransformation);
		if (profile.childBaseTransformation) this.settings.childBaseTransformation = deepClone(profile.childBaseTransformation);
		if (profile.folderColorOpacity !== undefined) this.settings.folderColorOpacity = profile.folderColorOpacity;
		if (profile.defaultIconRules) this.settings.defaultIconRules = deepClone(profile.defaultIconRules);

		this.settings.activeProfileId = profileId;
		await this.saveSettings();
		await this.folderManager.updateSettings(this.settings);
		new Notice(`Profile "${profile.name}" loaded`);
	}

	onunload() {
		if (this.folderManager) {
			this.folderManager.stopObserving();
		}
	}

	async loadSettings() {
		const loadedData = (await this.loadData()) as Partial<IconocolorSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loadedData ?? {}) };
		
		// Migration: ensure iconSize exists for existing users
		if (this.settings.iconSize === undefined) {
			this.settings.iconSize = DEFAULT_SETTINGS.iconSize;
		}
		
		// Migration: Merge color palettes - add new presets if they don't exist
		if (!this.settings.colorPalettes || this.settings.colorPalettes.length === 0) {
			this.settings.colorPalettes = [...DEFAULT_SETTINGS.colorPalettes];
		} else {
			// Merge: add any new palettes from defaults that don't exist
			const existingNames = new Set(this.settings.colorPalettes.map(p => p.name));
			const newPalettes = DEFAULT_SETTINGS.colorPalettes.filter(p => !existingNames.has(p.name));
			if (newPalettes.length > 0) {
				this.settings.colorPalettes = [...this.settings.colorPalettes, ...newPalettes];
			}
		}
		if (this.settings.activePaletteIndex === undefined) {
			this.settings.activePaletteIndex = 0;
		}
		if (this.settings.autoColorEnabled === undefined) {
			this.settings.autoColorEnabled = false;
		}
		if (this.settings.autoColorMode === undefined) {
			this.settings.autoColorMode = 'gradient';
		}
		
		// Migration: Initialize new transformation settings if missing
		if (!this.settings.iconColorTransformation) {
			this.settings.iconColorTransformation = DEFAULT_SETTINGS.iconColorTransformation;
		}
		if (!this.settings.folderColorTransformation) {
			this.settings.folderColorTransformation = DEFAULT_SETTINGS.folderColorTransformation;
		}
		if (!this.settings.textColorTransformation) {
			this.settings.textColorTransformation = DEFAULT_SETTINGS.textColorTransformation;
		}
		if (!this.settings.childBaseTransformation) {
			this.settings.childBaseTransformation = DEFAULT_SETTINGS.childBaseTransformation;
		}
		
		// Migration: Initialize profiles if missing
		if (!this.settings.profiles) {
			this.settings.profiles = [];
		}
		
		// Add preset profiles if none exist (check if user has any custom profiles)
		const hasCustomProfiles = this.settings.profiles.some(p => !p.id?.startsWith('preset-'));
		if (this.settings.profiles.length === 0 || !hasCustomProfiles) {
			// Add preset profiles if they don't exist
			const existingProfileIds = new Set(this.settings.profiles.map(p => p.id));
			const presetProfiles = this.getPresetProfiles();
			const newPresets = presetProfiles.filter(p => !existingProfileIds.has(p.id));
			if (newPresets.length > 0) {
				this.settings.profiles = [...this.settings.profiles, ...newPresets];
			}
		}
		
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.folderManager) {
			await this.folderManager.updateSettings(this.settings);
		}
	}

	/**
	 * Get preset profiles
	 */
	private getPresetProfiles(): SettingsProfile[] {
		return [
			{
				id: 'preset-minimal',
				name: 'Minimal',
				iconSize: 16,
				activePaletteIndex: 0, // Vibrant
				autoColorEnabled: true,
				autoColorMode: 'gradient',
				iconColorTransformation: { type: 'none' },
				folderColorTransformation: { type: 'none' },
				textColorTransformation: { type: 'lightness', adjustment: 25 },
				childBaseTransformation: { type: 'lightness', adjustment: 10, useGradient: false, backgroundOpacity: 0 },
				folderColorOpacity: 0,
				defaultIconRules: []
			},
			{
				id: 'preset-elegant',
				name: 'Elegant',
				iconSize: 18,
				activePaletteIndex: 1, // Pastel
				autoColorEnabled: true,
				autoColorMode: 'gradient',
				iconColorTransformation: { type: 'lightness', adjustment: -15 },
				folderColorTransformation: { type: 'none' },
				textColorTransformation: { type: 'lightness', adjustment: 30 },
				childBaseTransformation: { type: 'lightness', adjustment: 8, useGradient: true, backgroundOpacity: 0 },
				folderColorOpacity: 0,
				defaultIconRules: []
			},
			{
				id: 'preset-bold',
				name: 'Bold',
				iconSize: 20,
				activePaletteIndex: 0, // Vibrant
				autoColorEnabled: true,
				autoColorMode: 'gradient',
				iconColorTransformation: { type: 'none' },
				folderColorTransformation: { type: 'lightness', adjustment: -20 },
				textColorTransformation: { type: 'lightness', adjustment: 40 },
				childBaseTransformation: { type: 'hsl', hue: 5, saturation: 5, lightness: 8, useGradient: true, backgroundOpacity: 0 },
				folderColorOpacity: 0,
				defaultIconRules: []
			},
			{
				id: 'preset-root-background',
				name: 'Root Background',
				iconSize: 18,
				activePaletteIndex: 0, // Vibrant
				autoColorEnabled: true,
				autoColorMode: 'gradient',
				iconColorTransformation: { type: 'none' },
				folderColorTransformation: { type: 'lightness', adjustment: -15 },
				textColorTransformation: { type: 'lightness', adjustment: 35 },
				childBaseTransformation: { type: 'lightness', adjustment: 12, useGradient: false, backgroundOpacity: 0 },
				folderColorOpacity: 80,
				defaultIconRules: []
			}
		];
	}

	private openFolderConfigModal(folderPath: string): void {
		const currentConfig = this.settings.folderConfigs[folderPath] || {};

		new FolderConfigModal(
			this.app,
			currentConfig,
			this.settings,
			(result) => {
				const config: FolderConfig = {};
				const originalConfig = currentConfig || {};

				if (result.icon !== undefined) config.icon = result.icon;
				if (result.baseColor !== undefined) config.baseColor = result.baseColor;
				if (result.iconColor !== undefined) config.iconColor = result.iconColor;
				if (result.folderColor !== undefined) config.folderColor = result.folderColor;
				if (result.textColor !== undefined) config.textColor = result.textColor;
				if (result.applyToSubfolders !== undefined) config.applyToSubfolders = result.applyToSubfolders;
				if (result.inheritBaseColor !== undefined) config.inheritBaseColor = result.inheritBaseColor;

				const configWithDeletions = config as FolderConfigWithDeletions;
				if (originalConfig.baseColor !== undefined && result.baseColor === undefined) {
					configWithDeletions.__deleteBaseColor = true;
				}
				if (originalConfig.iconColor !== undefined && result.iconColor === undefined) {
					configWithDeletions.__deleteIconColor = true;
				}
				if (originalConfig.folderColor !== undefined && result.folderColor === undefined) {
					configWithDeletions.__deleteFolderColor = true;
				}
				if (originalConfig.textColor !== undefined && result.textColor === undefined) {
					configWithDeletions.__deleteTextColor = true;
				}

				void this.folderManager.setFolderConfig(folderPath, config);
			},
			folderPath
		).open();
	}
}

// Export for use in settings tab
export { IconocolorPlugin };

/**
 * Modal for switching profiles from command palette
 */
class ProfileSwitchModal extends Modal {
	private profiles: SettingsProfile[];
	private onSelect: (profileId: string) => void;

	constructor(app: App, profiles: SettingsProfile[], onSelect: (profileId: string) => void) {
		super(app);
		this.profiles = profiles;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('iconocolor-profile-switch-modal');

		contentEl.createEl('h2', { text: 'Switch profile' });

		const profilesList = contentEl.createDiv('iconocolor-profiles-list');

		this.profiles.forEach(profile => {
			const profileItem = profilesList.createDiv('iconocolor-profile-item');
			profileItem.createEl('div', { text: profile.name, cls: 'iconocolor-profile-name' });

			profileItem.onclick = () => {
				this.onSelect(profile.id);
				this.close();
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for switching the active color palette from the command palette.
 */
class PaletteSwitchModal extends Modal {
	private palettes: ColorPalette[];
	private activeIndex: number;
	private onSelect: (index: number) => void;

	constructor(
		app: App,
		palettes: ColorPalette[],
		activeIndex: number,
		onSelect: (index: number) => void,
	) {
		super(app);
		this.palettes = palettes;
		this.activeIndex = activeIndex;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('iconocolor-palette-switch-modal');

		contentEl.createEl('h2', { text: 'Switch color palette' });

		const list = contentEl.createDiv('iconocolor-palettes-list');

		this.palettes.forEach((palette, index) => {
			const item = list.createDiv('iconocolor-palette-item');
			if (index === this.activeIndex) {
				item.addClass('is-active');
			}

			item.createEl('div', { text: palette.name, cls: 'iconocolor-palette-name' });

			const swatchesEl = item.createDiv('iconocolor-palette-swatches');
			palette.colors.forEach(color => {
				const swatch = swatchesEl.createDiv('iconocolor-palette-swatch');
				swatch.style.setProperty('--iconocolor-swatch-color', color);
			});

			item.onclick = () => {
				this.onSelect(index);
				this.close();
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

