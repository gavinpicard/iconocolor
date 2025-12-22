import { App, Modal, Setting, Notice } from 'obsidian';
import { PREDEFINED_ICON_PACKS, PredefinedIconPack, downloadIconPack } from '../utils/iconPackManager';
import { getInstalledIconPacks } from '../utils/iconPackManager';
import { getAllIconsFromPacks } from '../utils/iconService';

export class BrowsePacksModal extends Modal {
	private searchQuery: string = '';
	private searchResults: PredefinedIconPack[] = [];
	private downloadingPacks: Set<string> = new Set();

	constructor(app: App, private onPackDownloaded?: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Browse icon packs' });

		// Search input
		new Setting(contentEl)
			.setName('Search icon packs')
			.setDesc('Type to search for icon packs')
			.addText(text => {
				text
					.setPlaceholder('E.g., tabler, heroicons, feather...')
					.setValue(this.searchQuery)
					.onChange((value) => {
						this.searchQuery = value;
						this.performSearch().catch(console.error);
					});
			});

		// Results container
		this.resultsContainer = contentEl.createDiv();
		this.resultsContainer.addClass('browse-packs-results');

			// Initial load
			this.performSearch().catch(console.error);
	}

	private resultsContainer: HTMLElement;

	private async performSearch(): Promise<void> {
		const installedPacks = await getInstalledIconPacks(this.app);
		const installedIds = new Set(installedPacks.filter(p => p.installed).map(p => p.id));

		const lowerQuery = this.searchQuery.toLowerCase().trim();
		
		if (!lowerQuery) {
			this.searchResults = PREDEFINED_ICON_PACKS;
		} else {
			this.searchResults = PREDEFINED_ICON_PACKS.filter(pack =>
				pack.name.toLowerCase().includes(lowerQuery) ||
				pack.description.toLowerCase().includes(lowerQuery) ||
				pack.id.toLowerCase().includes(lowerQuery)
			);
		}

		this.renderResults(installedIds);
	}

	private renderResults(installedIds: Set<string>): void {
		this.resultsContainer.empty();

		if (this.searchResults.length === 0) {
			this.resultsContainer.createEl('p', {
				text: 'No icon packs found. Try a different search term.',
				cls: 'browse-packs-empty',
			});
			return;
		}

		for (const pack of this.searchResults) {
			const isInstalled = installedIds.has(pack.id);
			const isDownloading = this.downloadingPacks.has(pack.id);

			const packCard = this.resultsContainer.createDiv();
			packCard.addClass('browse-packs-card');

			// Pack info
			const packInfo = packCard.createDiv();
			packInfo.addClass('browse-packs-card-info');

			const packName = packInfo.createEl('h4', { text: pack.name });
			packName.addClass('browse-packs-card-name');

			const packDesc = packInfo.createEl('p', { text: pack.description });
			packDesc.addClass('browse-packs-card-desc');

			const packMeta = packInfo.createDiv();
			packMeta.addClass('browse-packs-card-meta');
			packMeta.createEl('span', { text: `${pack.iconCount.toLocaleString()} icons` });

			if (isInstalled) {
				// Get actual icon count from installed pack
				getInstalledIconPacks(this.app).then(installedPacks => {
					const installedPack = installedPacks.find(p => p.id === pack.id && p.installed);
					if (installedPack && installedPack.iconCount) {
						packMeta.createEl('span', { text: ` • ${installedPack.iconCount} installed` });
					} else {
						packMeta.createEl('span', { text: 'Installed' });
					}
				}).catch(console.error);
			}

			// Action button
			const packActions = packCard.createDiv();
			packActions.addClass('browse-packs-card-actions');

			if (isInstalled) {
				const installedBtn = packActions.createEl('button', { text: 'Installed' });
				installedBtn.addClass('mod-cta');
				installedBtn.disabled = true;
			} else {
				const downloadBtn = packActions.createEl('button', {
					text: isDownloading ? 'Downloading...' : 'Download',
				});
				downloadBtn.addClass('mod-cta');
				downloadBtn.disabled = isDownloading;

				downloadBtn.onclick = async () => {
					this.downloadingPacks.add(pack.id);
					downloadBtn.textContent = 'Downloading...';
					downloadBtn.disabled = true;

					try {
						const result = await downloadIconPack(this.app, pack);
						if (result.success) {
							const count = result.downloaded || 0;
							
							// Force refresh the icon cache
							await getAllIconsFromPacks(this.app, true);
							
							// Remove from downloading set BEFORE re-rendering
							this.downloadingPacks.delete(pack.id);
							
							// Small delay to ensure vault cache is updated
							await new Promise(resolve => setTimeout(resolve, 100));
							
							// Force refresh vault cache by accessing the folder
							try {
								const packPath = `.obsidian/icons/${pack.id}`;
								await this.app.vault.adapter.exists(packPath);
								// Trigger a refresh by accessing the folder
								const packFolder = this.app.vault.getAbstractFileByPath(packPath);
								if (packFolder) {
									// Access children to force refresh
									(packFolder as any).children;
								}
							} catch (e) {
								// Ignore errors, just trying to refresh cache
							}
							
							// Refresh the display with fresh data
							const installedPacks = await getInstalledIconPacks(this.app);
							const newInstalledIds = new Set(
								installedPacks
									.filter(p => p.installed)
									.map(p => p.id)
							);
							this.renderResults(newInstalledIds);
							
							// Show success notice
							new Notice(`${pack.name} downloaded successfully! ${count.toLocaleString()} icons installed.`);
							
							// Notify parent
							if (this.onPackDownloaded) {
								this.onPackDownloaded();
							}
						} else {
							// Remove from downloading set on failure
							this.downloadingPacks.delete(pack.id);
							new Notice(`Failed to download ${pack.name}: ${result.error || 'Unknown error'}`);
							downloadBtn.textContent = 'Download';
							downloadBtn.disabled = false;
						}
					} catch (error) {
						// Remove from downloading set on error
						this.downloadingPacks.delete(pack.id);
						new Notice(`Error downloading ${pack.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
						downloadBtn.textContent = 'Download';
						downloadBtn.disabled = false;
					}
				};
			}
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
