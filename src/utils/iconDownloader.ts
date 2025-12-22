/**
 * Icon downloader utility for downloading icons to .obsidian/icons
 */

import { TFile, TFolder, requestUrl } from 'obsidian';

export interface DownloadResult {
	success: boolean;
	path?: string;
	error?: string;
}

/**
 * Validate URL format
 */
function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		// Only allow http and https protocols
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Sanitize file name to prevent path traversal and invalid characters
 */
function sanitizeFileName(fileName: string): string {
	// Remove path traversal attempts
	let sanitized = fileName.replace(/\.\./g, '').replace(/\//g, '').replace(/\\/g, '');
	// Remove invalid filename characters
	sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '');
	// Limit length
	if (sanitized.length > 100) {
		sanitized = sanitized.substring(0, 100);
	}
	return sanitized || 'icon';
}

/**
 * Ensure the .obsidian/icons folder exists
 */
export async function ensureIconsFolderExists(app: any): Promise<TFolder | null> {
	const iconsPath = '.obsidian/icons';
	
	// Helper function to find the icons folder
	const findIconsFolder = (): TFolder | null => {
		// Try direct path lookup
		const iconsFolder = app.vault.getAbstractFileByPath(iconsPath);
		if (iconsFolder instanceof TFolder) {
			return iconsFolder;
		}
		
		// Try accessing via .obsidian folder
		try {
			const obsidianFolder = app.vault.getAbstractFileByPath('.obsidian');
			if (obsidianFolder instanceof TFolder) {
				const iconsChild = obsidianFolder.children.find(
					(child: any) => child instanceof TFolder && child.name === 'icons'
				);
				if (iconsChild instanceof TFolder) {
					return iconsChild;
				}
			}
		} catch {
			// Ignore
		}
		
		return null;
	};
	
	// First check if folder already exists
	let iconsFolder = findIconsFolder();
	if (iconsFolder) {
		return iconsFolder;
	}
	
	// Try to create the folder
	try {
		await app.vault.createFolder(iconsPath);
	} catch (createError: any) {
		// If the error is that the folder already exists, that's fine
		const errorMessage = createError?.message || String(createError);
		if (errorMessage.includes('already exists') || errorMessage.includes('Folder already exists')) {
			// Folder exists, just find it - try a few times with small delays for cache
			for (let i = 0; i < 5; i++) {
				await new Promise(resolve => setTimeout(resolve, 100));
				iconsFolder = findIconsFolder();
				if (iconsFolder) {
					return iconsFolder;
				}
			}
		} else {
			// Some other error occurred
			console.error('Error creating icons folder:', createError);
		}
	}
	
	// Final check after creation attempt
	iconsFolder = findIconsFolder();
	if (iconsFolder) {
		return iconsFolder;
	}
	
	// If we still can't find it, the folder might not be accessible
	// But that's okay - return null and let the calling code handle it
	// The folder might exist in the file system but not be in Obsidian's cache yet
	return null;
}

/**
 * Download a SimpleIcons icon to .obsidian/icons
 */
export async function downloadSimpleIcon(
	app: any,
	iconName: string,
	color?: string
): Promise<DownloadResult> {
	try {
		// Sanitize icon name
		const slug = sanitizeFileName(iconName).toLowerCase().replace(/\s+/g, '-');
		
		// Validate color format if provided
		if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
			return { success: false, error: 'Invalid color format. Use hex format like #FF0000' };
		}

		// Ensure icons folder exists - but don't fail if we can't find it via API
		// The folder might exist in the file system even if Obsidian's API can't find it
		await ensureIconsFolderExists(app);

		// Fetch the SVG from SimpleIcons CDN using requestUrl to bypass CORS
		const colorParam = color ? `?color=${color.replace('#', '')}` : '';
		const url = `https://cdn.simpleicons.org/${slug}${colorParam}`;
		
		const response = await requestUrl({ url, method: 'GET' });
		if (response.status !== 200) {
			return { success: false, error: `Failed to fetch icon: HTTP ${response.status}` };
		}

		const svgContent = response.text || '';
		
		// Save to .obsidian/icons/{iconName}.svg
		const fileName = `${iconName.toLowerCase()}.svg`;
		const filePath = `.obsidian/icons/${fileName}`;
		
		// Check if file already exists
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			// Update existing file
			await app.vault.modify(existingFile, svgContent);
		} else {
			// Create new file
			await app.vault.create(filePath, svgContent);
		}

		return { success: true, path: filePath };
	} catch (error) {
		console.error('Failed to download SimpleIcon:', error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

/**
 * Download an icon from a URL to .obsidian/icons
 */
export async function downloadIconFromUrl(
	app: any,
	url: string,
	fileName: string
): Promise<DownloadResult> {
	try {
		// Validate URL
		if (!isValidUrl(url)) {
			return { success: false, error: 'Invalid URL format. Only http:// and https:// URLs are allowed.' };
		}

		// Sanitize file name
		fileName = sanitizeFileName(fileName);

		// Ensure icons folder exists - but don't fail if we can't find it via API
		// The folder might exist in the file system even if Obsidian's API can't find it
		await ensureIconsFolderExists(app);

		// Fetch the icon using requestUrl to bypass CORS
		const response = await requestUrl({ url, method: 'GET' });
		if (response.status !== 200) {
			return { success: false, error: `Failed to fetch icon: HTTP ${response.status}` };
		}

		const content = response.text || '';
		
		// Ensure fileName has .svg extension
		if (!fileName.endsWith('.svg')) {
			fileName = `${fileName}.svg`;
		}
		
		const filePath = `.obsidian/icons/${fileName}`;
		
		// Check if file already exists
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			// Update existing file
			await app.vault.modify(existingFile, content);
		} else {
			// Create new file
			await app.vault.create(filePath, content);
		}

		return { success: true, path: filePath };
	} catch (error) {
		console.error('Failed to download icon from URL:', error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

/**
 * Check if an icon path is a local icon (in .obsidian/icons)
 */
export function isLocalIcon(path: string): boolean {
	return path.startsWith('.obsidian/icons/') || path.startsWith('/.obsidian/icons/');
}

