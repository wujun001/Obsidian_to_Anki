import { Notice, Plugin, addIcon, TFile, TFolder } from 'obsidian'
import * as AnkiConnect from './src/anki'
import { PluginSettings, ParsedSettings } from './src/interfaces/settings-interface'
import { DEFAULT_IGNORED_FILE_GLOBS, SettingsTab } from './src/settings'
import { ANKI_ICON } from './src/constants'
import { settingToData } from './src/setting-to-data'
import { FileManager } from './src/files-manager'

export default class MyPlugin extends Plugin {

	settings: PluginSettings
	note_types: Array<string>
	fields_dict: Record<string, string[]>
	added_media: string[]
	file_hashes: Record<string, string>
	private statusBarItem: HTMLElement;

	async getDefaultSettings(): Promise<PluginSettings> {
		let settings: PluginSettings = {
			CUSTOM_REGEXPS: {},
			FILE_LINK_FIELDS: {},
			CONTEXT_FIELDS: {},
			FOLDER_DECKS: {},
			FOLDER_TAGS: {},
			Syntax: {
				"Begin Note": "START",
				"End Note": "END",
				"Begin Inline Note": "STARTI",
				"End Inline Note": "ENDI",
				"Target Deck Line": "TARGET DECK",
				"File Tags Line": "FILE TAGS",
				"Delete Note Line": "DELETE",
				"Frozen Fields Line": "FROZEN"
			},
			Defaults: {
				"Scan Directory": "",
				"Tag": "Obsidian_to_Anki",
				"Deck": "Default",
				"Scheduling Interval": 0,
				"Add File Link": false,
				"Add Context": false,
				"CurlyCloze": false,
				"CurlyCloze - Highlights to Clozes": false,
				"ID Comments": true,
				"Add Obsidian Tags": false,
			},
			IGNORED_FILE_GLOBS: DEFAULT_IGNORED_FILE_GLOBS,
		}
		/*Making settings from scratch, so need note types*/
		this.note_types = await AnkiConnect.invoke('modelNames') as Array<string>
		this.fields_dict = await this.generateFieldsDict()
		for (let note_type of this.note_types) {
			settings["CUSTOM_REGEXPS"][note_type] = ""
			const field_names: string[] = await AnkiConnect.invoke(
				'modelFieldNames', {modelName: note_type}
			) as string[]
			this.fields_dict[note_type] = field_names
			settings["FILE_LINK_FIELDS"][note_type] = field_names[0]
		}
		return settings
	}

	async generateFieldsDict(): Promise<Record<string, string[]>> {
		let fields_dict = {}
		for (let note_type of this.note_types) {
			const field_names: string[] = await AnkiConnect.invoke(
				'modelFieldNames', {modelName: note_type}
			) as string[]
			fields_dict[note_type] = field_names
		}
		return fields_dict
	}

	async saveDefault(): Promise<void> {
		const default_sets = await this.getDefaultSettings()
		this.saveData(
			{
				settings: default_sets,
				"Added Media": [],
				"File Hashes": {},
				fields_dict: {}
			}
		)
	}

	async loadSettings(): Promise<PluginSettings> {
		let current_data = await this.loadData()
		if (current_data == null || Object.keys(current_data).length != 4) {
			new Notice("Need to connect to Anki generate default settings...")
			const default_sets = await this.getDefaultSettings()
			this.saveData(
				{
					settings: default_sets,
					"Added Media": [],
					"File Hashes": {},
					fields_dict: {}
				}
			)
			new Notice("Default settings successfully generated!")
			return default_sets
		} else {
			return current_data.settings
		}
	}

	async loadAddedMedia(): Promise<string[]> {
		let current_data = await this.loadData()
		if (current_data == null) {
			await this.saveDefault()
			return []
		} else {
			return current_data["Added Media"]
		}
	}

	async loadFileHashes(): Promise<Record<string, string>> {
		let current_data = await this.loadData()
		if (current_data == null) {
			await this.saveDefault()
			return {}
		} else {
			return current_data["File Hashes"]
		}
	}

	async loadFieldsDict(): Promise<Record<string, string[]>> {
		let current_data = await this.loadData()
		if (current_data == null) {
			await this.saveDefault()
			const fields_dict = await this.generateFieldsDict()
			return fields_dict
		}
		return current_data.fields_dict
	}

	async saveAllData(): Promise<void> {
		this.saveData(
				{
					settings: this.settings,
					"Added Media": this.added_media,
					"File Hashes": this.file_hashes,
					fields_dict: this.fields_dict
				}
		)
	}

	regenerateSettingsRegexps() {
		let regexp_section = this.settings["CUSTOM_REGEXPS"]
		// For new note types
		for (let note_type of this.note_types) {
			this.settings["CUSTOM_REGEXPS"][note_type] = regexp_section.hasOwnProperty(note_type) ? regexp_section[note_type] : ""
		}
		// Removing old note types
		for (let note_type of Object.keys(this.settings["CUSTOM_REGEXPS"])) {
			if (!this.note_types.includes(note_type)) {
				delete this.settings["CUSTOM_REGEXPS"][note_type]
			}
		}
	}

	/**
	 * Recursively traverse a TFolder and return all TFiles.
	 * @param tfolder - The TFolder to start the traversal from.
	 * @returns An array of TFiles found within the folder and its subfolders.
	 */
	getAllTFilesInFolder(tfolder) {
		const allTFiles = [];
		// Check if the provided object is a TFolder
		if (!(tfolder instanceof TFolder)) {
			return allTFiles;
		}
		// Iterate through the contents of the folder
		tfolder.children.forEach((child) => {
			// If it's a TFile, add it to the result
			if (child instanceof TFile) {
				allTFiles.push(child);
			} else if (child instanceof TFolder) {
				// If it's a TFolder, recursively call the function on it
				const filesInSubfolder = this.getAllTFilesInFolder(child);
				allTFiles.push(...filesInSubfolder);
			}
			// Ignore other types of files or objects
		});
		return allTFiles;
	}
	// 更新状态栏的辅助方法
	private updateStatusBar(currentStep: number, totalSteps: number, message: string) {
		if (currentStep === 0) {
			// 清空状态栏
			this.statusBarItem.setText("");
			return;
		}

		// 根据当前步骤生成进度条
		const completed = "🟢".repeat(currentStep); // 已完成的部分
		const remaining = "⚪".repeat(totalSteps - currentStep); // 未完成的部分
		const progressBar = completed + remaining;

		// 更新状态栏内容
		const statusMessage = `${currentStep}/${totalSteps} ${progressBar} ${message}`;
		this.statusBarItem.setText(statusMessage);

		// 同时输出到控制台
		console.info(`Status Updated: ${statusMessage}`);
	}

	async scanVault() {
		// 初始化步骤耗时记录
		const stepTimes: Array<{ step: string, time: number }> = [];
		let stepStartTime: number; // 记录每一步开始的时间
	
		const recordStepTime = (step: string) => {
			const stepEndTime = Date.now();
			const stepElapsedTime = ((stepEndTime - stepStartTime) / 1000).toFixed(2); // 转换为秒
			stepTimes.push({ step, time: parseFloat(stepElapsedTime) });
			stepStartTime = stepEndTime; // 更新下一步的开始时间
		};
	
		// 开始任务
		const totalStartTime = Date.now(); // 总任务开始时间
		stepStartTime = totalStartTime;
	
		// 初始化状态栏并设置任务开始状态
		new Notice('Scanning vault, check console for details...');
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar(1, 8, "Checking connection to Anki...");
	
		try {
			await AnkiConnect.invoke('modelNames');
		} catch (e) {
			new Notice("Error, couldn't connect to Anki! Check console for error message.");
			this.updateStatusBar(0, 8, ""); // 清空状态栏
			return;
		}
		recordStepTime("Connecting to Anki");
	
		// 连接成功，状态更新
		new Notice("Successfully connected to Anki! This could take a few minutes - please don't close Anki until the plugin is finished");
		this.updateStatusBar(2, 8, "Connected to Anki, preparing scan...");
	
		const data: ParsedSettings = await settingToData(this.app, this.settings, this.fields_dict);
		const scanDir = this.app.vault.getAbstractFileByPath(this.settings.Defaults["Scan Directory"]);
		const scanDirPath = scanDir instanceof TFolder ? scanDir.path : "Default Directory";
		console.info(`Scan directory: ${scanDirPath}`);
		this.updateStatusBar(3, 8, "Loading scan directory...");
		recordStepTime("Preparing scan directory");
	
		let manager = null;
		let markdownFiles = [];
		if (scanDir !== null) {
			if (scanDir instanceof TFolder) {
				console.info("Using custom scan directory: " + scanDir.path);
				markdownFiles = this.getAllTFilesInFolder(scanDir);
			} else {
				new Notice("Error: incorrect path for scan directory " + this.settings.Defaults["Scan Directory"]);
				this.updateStatusBar(0, 8, ""); // 清空状态栏
				return;
			}
			this.updateStatusBar(4, 8, "Files loaded, initializing FileManager...");
			manager = new FileManager(this.app, data, markdownFiles, this.file_hashes, this.added_media);
		} else {
			markdownFiles = this.app.vault.getMarkdownFiles();
			this.updateStatusBar(4, 8, "Using default scan directory...");
			manager = new FileManager(this.app, data, markdownFiles, this.file_hashes, this.added_media);
		}
	
		// 输出处理的文件数量
		console.info(`Number of Markdown files found: ${markdownFiles.length}`);
		recordStepTime(`Loading files (${markdownFiles.length} files) and initializing FileManager`);
	
		// 文件管理器初始化完成
		this.updateStatusBar(5, 8, "Initializing files...");
		await manager.initialiseFiles();
		recordStepTime("Initializing files");
	
		// 处理请求
		this.updateStatusBar(6, 8, "Processing requests...");
		await manager.requests_1();
		recordStepTime("Processing requests");
	
		// 更新媒体数据
		this.added_media = Array.from(manager.added_media_set);
	
		// 保存文件哈希
		const hashes = manager.getHashes();
		for (let key in hashes) {
			this.file_hashes[key] = hashes[key];
		}
		recordStepTime("Saving file hashes and media data");
	
		// 保存所有数据
		this.updateStatusBar(7, 8, "Saving all data...");
		const saveStartTime = Date.now();
		await this.saveAllData();
		const saveElapsedTime = ((Date.now() - saveStartTime) / 1000).toFixed(2);
		stepTimes.push({ step: "Saving all data", time: parseFloat(saveElapsedTime) });
	
		// 更新任务结束状态
		this.updateStatusBar(8, 8, "Scan complete. Saving data...");
		const totalEndTime = Date.now();
		const totalElapsedTime = ((totalEndTime - totalStartTime) / 1000).toFixed(2); // 总耗时（秒）
	
		// 输出详细耗时统计
		console.info("Task completed. Step-by-step time breakdown:");
		stepTimes.forEach(({ step, time }) => console.info(`- ${step}: ${time}s`));
		console.info(`Total time: ${totalElapsedTime}s`);
		console.info(`Scan directory: ${scanDirPath}`);
		console.info(`Number of Markdown files processed: ${markdownFiles.length}`);
	
		const detailedTime = stepTimes.map(({ step, time }) => `- ${step}: ${time}s`).join("\n");
		new Notice(
			`All done! Saving file hashes and added media now...\n` +
			`Total Time: ${totalElapsedTime}s\n` +
			detailedTime + `\n` +
			`Scan directory: ${scanDirPath}\n` +
			`Files processed: ${markdownFiles.length}`
		);
	
		// 最后清空状态栏
		this.updateStatusBar(0, 8, ""); // 清空状态栏
	}
	

	async onload() {
		console.log('loading Obsidian_to_Anki...');
		addIcon('anki', ANKI_ICON)

		try {
			this.settings = await this.loadSettings()
		}
		catch(e) {
			new Notice("Couldn't connect to Anki! Check console for error message.")
			return
		}

		this.note_types = Object.keys(this.settings["CUSTOM_REGEXPS"])
		this.fields_dict = await this.loadFieldsDict()
		if (Object.keys(this.fields_dict).length == 0) {
			new Notice('Need to connect to Anki to generate fields dictionary...')
			try {
				this.fields_dict = await this.generateFieldsDict()
				new Notice("Fields dictionary successfully generated!")
			}
			catch(e) {
				new Notice("Couldn't connect to Anki! Check console for error message.")
				return
			}
		}
		this.added_media = await this.loadAddedMedia()
		this.file_hashes = await this.loadFileHashes()

		this.addSettingTab(new SettingsTab(this.app, this));

		this.addRibbonIcon('anki', 'Obsidian_to_Anki - Scan Vault', async () => {
			await this.scanVault()
		})

		this.addCommand({
			id: 'anki-scan-vault',
			name: 'Scan Vault',
			callback: async () => {
			 	await this.scanVault()
			 }
		})
	}

	async onunload() {
		console.log("Saving settings for Obsidian_to_Anki...")
		this.saveAllData()
		console.log('unloading Obsidian_to_Anki...');
	}
}
