/**
 * Icon pack manager for downloading and managing icon packs
 */

import { App, TFile, TFolder, requestUrl } from 'obsidian';
import { ensureIconsFolderExists } from './iconDownloader';
import { clearIconCache } from './iconService';

/**
 * Window interface extended with JSZip (loaded from CDN)
 * JSZip is loaded dynamically, so we define a minimal interface
 */
interface JSZipFile {
	dir: boolean;
	async(type: 'string'): Promise<string>;
}

interface JSZipInstance {
	loadAsync(data: ArrayBuffer): Promise<JSZipInstance>;
	forEach(callback: (relativePath: string, file: JSZipFile) => void): void;
}

interface WindowWithJSZip extends Window {
	JSZip?: {
		new (): JSZipInstance;
		loadAsync(data: ArrayBuffer): Promise<JSZipInstance>;
	};
}

export interface IconPack {
	id: string;
	name: string;
	description: string;
	downloadUrl?: string;
	iconCount?: number;
	installed: boolean;
	path?: string; // Path to the icon pack folder
}

export interface PredefinedIconPack {
	id: string;
	name: string;
	description: string;
	downloadUrl: string;
	iconCount: number;
}

// Predefined icon packs that can be downloaded
export const PREDEFINED_ICON_PACKS: PredefinedIconPack[] = [
	{
		id: 'simple-icons',
		name: 'Simple Icons',
		description: 'Over 2000+ brand icons from SimpleIcons',
		downloadUrl: 'https://github.com/simple-icons/simple-icons/archive/refs/heads/master.zip',
		iconCount: 2000,
	},
	{
		id: 'tabler-icons',
		name: 'Tabler Icons',
		description: 'Over 4000+ free SVG icons',
		downloadUrl: 'https://github.com/tabler/tabler-icons/archive/refs/heads/master.zip',
		iconCount: 4000,
	},
	{
		id: 'heroicons',
		name: 'Heroicons',
		description: 'Beautiful hand-crafted SVG icons by the makers of Tailwind CSS',
		downloadUrl: 'https://github.com/tailwindlabs/heroicons/archive/refs/heads/master.zip',
		iconCount: 300,
	},
	{
		id: 'feather-icons',
		name: 'Feather Icons',
		description: 'Simply beautiful open source icons',
		downloadUrl: 'https://github.com/feathericons/feather/archive/refs/heads/master.zip',
		iconCount: 280,
	},
	{
		id: 'phosphor-icons',
		name: 'Phosphor Icons',
		description: 'A flexible icon family for interfaces, presentations, and whatever else',
		downloadUrl: 'https://github.com/phosphor-icons/core/archive/refs/heads/main.zip',
		iconCount: 1300,
	},
	{
		id: 'remix-icon',
		name: 'Remix Icon',
		description: 'Open source neutral style icon system',
		downloadUrl: 'https://github.com/Remix-Design/RemixIcon/archive/refs/heads/master.zip',
		iconCount: 2500,
	},
	{
		id: 'ionicons',
		name: 'Ionicons',
		description: 'Premium designed icons for use in web, iOS, Android, and desktop apps',
		downloadUrl: 'https://github.com/ionic-team/ionicons/archive/refs/heads/main.zip',
		iconCount: 1300,
	},
	{
		id: 'octicons',
		name: 'Octicons',
		description: 'GitHub\'s icon library',
		downloadUrl: 'https://github.com/primer/octicons/archive/refs/heads/main.zip',
		iconCount: 200,
	},
];

/**
 * Get all icon packs from config/icons folder
 */
export async function getInstalledIconPacks(app: App): Promise<IconPack[]> {
	const packs: IconPack[] = [];
	
	try {
		// Try to get icons folder - use adapter for more reliable access to config folder
		const configDir = app.vault.configDir;
		const iconsPath = `${configDir}/icons`;
		let iconsFolder: TFolder | null = null;
		
		// First try direct path
		const directFolder = app.vault.getAbstractFileByPath(iconsPath);
		if (directFolder instanceof TFolder) {
			iconsFolder = directFolder;
		} else {
			// Try accessing via config folder
			const configFolder = app.vault.getAbstractFileByPath(configDir);
			if (configFolder instanceof TFolder) {
				// Force refresh by accessing children
				// Access children property to force cache refresh
				void configFolder.children;
				const iconsChild = configFolder.children.find(
					(child) => child instanceof TFolder && child.name === 'icons'
				);
				if (iconsChild instanceof TFolder) {
					iconsFolder = iconsChild;
				}
			}
		}
		
		// If still not found, try using adapter to check if it exists and force refresh
		if (!iconsFolder) {
			try {
				const iconsPathExists = app.vault.adapter.exists(iconsPath);
				// Handle both sync and async exists
				const exists = iconsPathExists instanceof Promise ? await iconsPathExists : iconsPathExists;
				if (exists) {
					// Force a refresh by listing the directory
					try {
						const listResult = app.vault.adapter.list(configDir);
						if (listResult instanceof Promise) {
							await listResult;
						}
					} catch {
						// Ignore list errors
					}
					// Try one more time after adapter check
					const retryFolder = app.vault.getAbstractFileByPath(iconsPath);
					if (retryFolder instanceof TFolder) {
						iconsFolder = retryFolder;
					}
				}
			} catch {
				// Ignore adapter errors
			}
		}
		
		// Helper function to count SVG files recursively
		const countSvgFilesRecursive = async (folderPath: string): Promise<number> => {
			let count = 0;
			try {
				// Use adapter to list files directly
				const listResult = app.vault.adapter.list(folderPath);
				const listing = listResult instanceof Promise ? await listResult : listResult;
				
				// Count SVG files
				for (const file of listing.files) {
					if (file.endsWith('.svg')) {
						count++;
					}
				}
				
				// Recursively count in subdirectories
				for (const dir of listing.folders) {
					count += await countSvgFilesRecursive(dir);
				}
			} catch {
				// Fallback to vault API if adapter fails
				try {
					const folder = app.vault.getAbstractFileByPath(folderPath);
					if (folder instanceof TFolder) {
						for (const child of folder.children) {
							if (child instanceof TFile && child.extension === 'svg') {
								count++;
							} else if (child instanceof TFolder) {
								count += await countSvgFilesRecursive(child.path);
							}
						}
					}
				} catch (err) {
					console.warn(`Failed to count icons in ${folderPath}:`, err);
				}
			}
			return count;
		};

		// Use adapter to directly list folders in config/icons for more reliable detection
		// Reuse configDir and iconsPath from outer scope
		let packFolders: string[] = [];
		try {
			const listResult = app.vault.adapter.list(iconsPath);
			const listing = listResult instanceof Promise ? await listResult : listResult;
			packFolders = listing.folders.map((f: string) => {
				// Extract folder name from full path
				const parts = f.split('/');
				return parts[parts.length - 1];
			});
		} catch {
			// Fallback to vault API
			if (iconsFolder) {
				packFolders = iconsFolder.children
					.filter((child) => child instanceof TFolder)
					.map((child: TFolder) => child.name);
			}
		}

		// Check for predefined packs
		for (const predefined of PREDEFINED_ICON_PACKS) {
			const packFolderName = predefined.id;
			const packFolderPath = `${iconsPath}/${packFolderName}`;
			
			// Check if pack folder exists using adapter
			let packExists = false;
			try {
				const existsResult = app.vault.adapter.exists(packFolderPath);
				packExists = existsResult instanceof Promise ? await existsResult : existsResult;
			} catch {
				// Fallback: check if folder name is in the list
				packExists = packFolders.includes(packFolderName);
			}

			if (packExists) {
				const iconCount = await countSvgFilesRecursive(packFolderPath);
				
				packs.push({
					...predefined,
					installed: true,
					path: packFolderPath,
					iconCount: iconCount,
				});
			} else {
				packs.push({
					...predefined,
					installed: false,
				});
			}
		}

		// Check for other custom icon pack folders
		for (const folderName of packFolders) {
			const isPredefined = PREDEFINED_ICON_PACKS.some(p => p.id === folderName);
			if (!isPredefined) {
				const customPackPath = `${iconsPath}/${folderName}`;
				const iconCount = await countSvgFilesRecursive(customPackPath);
				
				packs.push({
					id: folderName.toLowerCase().replace(/\s+/g, '-'),
					name: folderName,
					description: `Custom icon pack with ${iconCount} icons`,
					installed: true,
					path: customPackPath,
					iconCount: iconCount,
				});
			}
		}
	} catch (error) {
		console.error('Failed to get icon packs:', error);
	}

	return packs;
}

/**
 * Delete an installed icon pack
 */
export async function deleteIconPack(
	app: App,
	pack: IconPack
): Promise<{ success: boolean; error?: string }> {
	if (!pack.path) {
		return { success: false, error: 'Pack path not found' };
	}

	try {
		// Check if pack folder exists
		const existsResult = app.vault.adapter.exists(pack.path);
		const exists = existsResult instanceof Promise ? await existsResult : existsResult;
		
		if (!exists) {
			return { success: false, error: 'Pack folder does not exist' };
		}

		// Delete the folder recursively using adapter
		await app.vault.adapter.rmdir(pack.path, true);
		
		// Clear icon cache to force refresh
		clearIconCache(app);
		
		return { success: true };
	} catch (error) {
		console.error('Failed to delete icon pack:', error);
		return { 
			success: false, 
			error: error instanceof Error ? error.message : 'Unknown error' 
		};
	}
}

// Removed getAllIconsFromPacks - now in iconService.ts using obsidian-iconize approach

/**
 * Download an icon pack - downloads zip, extracts it, and copies SVG files
 * Similar to obsidian-iconize approach
 */
export async function downloadIconPack(
	app: App,
	pack: PredefinedIconPack
): Promise<{ success: boolean; error?: string; downloaded?: number }> {
	try {
		// Ensure icons folder exists
		await ensureIconsFolderExists(app);

		const configDir = app.vault.configDir;
		const packFolderPath = `${configDir}/icons/${pack.id}`;
		
		// Create pack folder if it doesn't exist
		try {
			await app.vault.createFolder(packFolderPath);
		} catch (createError: unknown) {
			const errorMessage = createError instanceof Error ? createError.message : String(createError);
			if (!errorMessage.includes('already exists') && !errorMessage.includes('Folder already exists')) {
				return { success: false, error: `Failed to create pack folder: ${errorMessage}` };
			}
		}

		// Download the zip file - use Obsidian's requestUrl (bypasses CORS)
		let arrayBuffer: ArrayBuffer;
		try {
			// Use Obsidian's requestUrl which bypasses CORS restrictions
			// This is imported from 'obsidian' module, not from app
			const response = await requestUrl({ 
				url: pack.downloadUrl,
				method: 'GET'
			});
			
			// requestUrl returns an object with arrayBuffer property
			if (response.arrayBuffer) {
				arrayBuffer = response.arrayBuffer;
			} else {
				// Fallback: try to get arrayBuffer from response
				throw new Error('Response does not contain arrayBuffer');
			}
		} catch (error) {
			console.error('Download error:', error);
			return { success: false, error: `Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}. Please download manually from: ${pack.downloadUrl}` };
		}
		
		// Use JSZip to extract (we'll load it dynamically)
		// JSZip is loaded from CDN and added to window object
		let JSZip = (window as WindowWithJSZip).JSZip;
		if (!JSZip) {
			const loadedJSZip = await loadJSZip();
			if (!loadedJSZip) {
				return { success: false, error: 'JSZip library not available. Please install icon packs manually.' };
			}
			JSZip = loadedJSZip;
		}

		const zip = await JSZip.loadAsync(arrayBuffer);
		let downloadedCount = 0;

		// Find and extract all SVG files
		const svgFiles: Array<{ path: string; content: string }> = [];
		
		// Process all files in the zip - collect all SVG files first
		const fileEntries: Array<{ path: string; file: JSZipFile }> = [];
		zip.forEach((relativePath: string, file: JSZipFile) => {
			if (!file.dir && relativePath.endsWith('.svg')) {
				fileEntries.push({ path: relativePath, file });
			}
		});

		// Extract all SVG files in parallel
		await Promise.all(
			fileEntries.map(async ({ path, file }) => {
				try {
					const content = await file.async('string');
					svgFiles.push({ path, content });
				} catch (error) {
					console.warn(`Failed to extract ${path}:`, error);
				}
			})
		);

		// Save SVG files to the pack folder
		// Process in batches to avoid overwhelming the vault API
		const batchSize = 10;
		
		// Determine the icons folder path within the zip based on pack structure
		const getIconsPath = (packId: string, zipPath: string): string | null => {
			// Common patterns for different icon packs
			const patterns = [
				/.*\/icons\/(.+\.svg)$/i,           // Most packs: .../icons/icon.svg
				/.*\/svg\/(.+\.svg)$/i,             // Some packs: .../svg/icon.svg
				/.*\/assets\/(.+\.svg)$/i,          // Some packs: .../assets/icon.svg
				/.*\/src\/(.+\.svg)$/i,             // Some packs: .../src/icon.svg
				/.*\/dist\/(.+\.svg)$/i,            // Some packs: .../dist/icon.svg
			];
			
			for (const pattern of patterns) {
				const match = zipPath.match(pattern);
				if (match) {
					return match[1];
				}
			}
			
			// Fallback: if path contains the pack name, try to extract relative path
			const packNamePattern = new RegExp(`.*${packId}[^/]*/(.+\.svg)$`, 'i');
			const packMatch = zipPath.match(packNamePattern);
			if (packMatch) {
				// Check if it's in an icons/svg/assets folder
				const relativePath = packMatch[1];
				if (relativePath.includes('/icons/') || relativePath.includes('/svg/') || relativePath.includes('/assets/')) {
					const parts = relativePath.split('/');
					const iconsIndex = parts.findIndex(p => /icons?|svg|assets/i.test(p));
					if (iconsIndex >= 0 && iconsIndex < parts.length - 1) {
						return parts.slice(iconsIndex + 1).join('/');
					}
				}
				return relativePath;
			}
			
			// Last resort: just use filename
			const pathParts = zipPath.split('/');
			return pathParts[pathParts.length - 1];
		};
		
		for (let i = 0; i < svgFiles.length; i += batchSize) {
			const batch = svgFiles.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (svgFile) => {
					try {
						// Get the icon file path within the pack
						const iconRelativePath = getIconsPath(pack.id, svgFile.path);
						if (!iconRelativePath) {
							console.warn(`Could not determine icon path for ${svgFile.path}`);
							return;
						}
						
						// Clean up filename - normalize to lowercase with hyphens
						// Sanitize path to prevent path traversal
						const sanitizedPath = iconRelativePath.replace(/\.\./g, '').replace(/[<>:"|?*\x00-\x1f]/g, '');
						const pathParts = sanitizedPath.split('/').filter(p => p.length > 0);
						
						if (pathParts.length === 0) {
							console.warn(`Invalid icon path: ${iconRelativePath}`);
							return;
						}
						
						const fileName = pathParts[pathParts.length - 1].toLowerCase().replace(/\s+/g, '-');
						
						// For nested paths, create subdirectories if needed
						let filePath: string;
						if (pathParts.length > 1) {
							// Create subdirectory structure (e.g., for heroicons outline/solid variants)
							const subDir = pathParts.slice(0, -1).join('/').toLowerCase().replace(/\s+/g, '-');
							const subDirPath = `${packFolderPath}/${subDir}`;
							// Create subdirectory if it doesn't exist
							try {
								await app.vault.adapter.mkdir(subDirPath);
							} catch (e: unknown) {
								// Ignore if already exists
								const errorMessage = e instanceof Error ? e.message : String(e);
								if (!errorMessage.includes('already exists') && !errorMessage.includes('Folder already exists')) {
									console.warn(`Failed to create subdirectory ${subDirPath}:`, errorMessage);
								}
							}
							filePath = `${subDirPath}/${fileName}`;
						} else {
							filePath = `${packFolderPath}/${fileName}`;
						}

						// Check if file already exists
						const existingFile = app.vault.getAbstractFileByPath(filePath);
						if (existingFile instanceof TFile) {
							await app.vault.modify(existingFile, svgFile.content);
						} else {
							await app.vault.create(filePath, svgFile.content);
						}
						downloadedCount++;
					} catch (error) {
						console.warn(`Failed to save ${svgFile.path}:`, error);
					}
				})
			);
		}

		// Force cache refresh by invalidating it (next call will reload)
		// The cache will naturally expire, but we can also force refresh by calling
		// getAllIconsFromPacks with forceRefresh=true when needed
		clearIconCache();

		return { success: true, downloaded: downloadedCount };
	} catch (error) {
		console.error('Failed to download icon pack:', error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

/**
 * Load JSZip library dynamically from CDN
 */
async function loadJSZip(): Promise<NonNullable<WindowWithJSZip['JSZip']> | null> {
	return new Promise((resolve) => {
		// Check if already loaded
		const windowWithJSZip = window as WindowWithJSZip;
		if (windowWithJSZip.JSZip) {
			resolve(windowWithJSZip.JSZip);
			return;
		}

		// Load from CDN
		const script = document.createElement('script');
		script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
		script.onload = () => {
			resolve(windowWithJSZip.JSZip || null);
		};
		script.onerror = () => {
			console.error('Failed to load JSZip library');
			resolve(null);
		};
		document.head.appendChild(script);
	});
}


