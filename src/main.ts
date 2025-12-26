import { Plugin, TFolder, Modal, Notice, App } from 'obsidian';
import { IconocolorSettings, FolderConfig, SettingsProfile, FolderConfigWithDeletions } from './types';
import { DEFAULT_SETTINGS } from './settings';
import { FolderManager } from './folderManager';
import { IconocolorSettingTab } from './ui/settingsTab';
import { FolderConfigModal } from './ui/folderConfigModal';

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

		// Add command to open settings
		this.addCommand({
			id: 'open-settings',
			name: 'Open settings',
			callback: () => {
				// @ts-expect-error - setting API may vary
				this.app.setting.open();
				// @ts-expect-error - setting API may vary
				this.app.setting.openTabById(this.manifest.id);
			},
		});

		// Add command to switch profiles
		this.addCommand({
			id: 'switch-profile',
			name: 'Switch profile',
			callback: async () => {
				const profiles = this.settings.profiles || [];
				if (profiles.length === 0) {
					new Notice('No profiles available. Create a profile in settings first.');
					return;
				}

				// Create a simple modal to select profile
				const modal = new ProfileSwitchModal(this.app, profiles, async (profileId: string) => {
					await this.loadProfile(profileId);
				});
				modal.open();
			},
		});
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

		// Helper function for deep cloning
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
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
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
			async (result) => {
				// Build config with explicitly set values and track deletions
				const config: FolderConfig = {};
				const originalConfig = currentConfig || {};
				
				// Include properties that are explicitly set (not undefined)
				if (result.icon !== undefined) config.icon = result.icon;
				if (result.baseColor !== undefined) config.baseColor = result.baseColor;
				if (result.iconColor !== undefined) config.iconColor = result.iconColor;
				if (result.folderColor !== undefined) config.folderColor = result.folderColor;
				if (result.textColor !== undefined) config.textColor = result.textColor;
				if (result.applyToSubfolders !== undefined) config.applyToSubfolders = result.applyToSubfolders;
				if (result.inheritBaseColor !== undefined) config.inheritBaseColor = result.inheritBaseColor;
				
				// Explicitly delete properties that existed in original but are now undefined
				// This handles the case where user reverts a color - we need to delete it
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

				await this.folderManager.setFolderConfig(folderPath, config);
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
	private onSelect: (profileId: string) => Promise<void>;

	constructor(app: App, profiles: SettingsProfile[], onSelect: (profileId: string) => Promise<void>) {
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
			
			profileItem.onclick = async () => {
				await this.onSelect(profile.id);
				this.close();
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

