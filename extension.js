const vscode = require('vscode');
const path = require('path');


//Global variables
const configfileDocName = 'monishprojectapiconfig.json';
const configfile = {
	'api': '',
	'projects': [],
};
const hostnameAPI = "https://bilendi.decipherinc.com/api/v1/";
let isUsingAPI = false;
const XML_SCHEME = 'monish-xml-datasource';
const xmlCache = new Map();


// vscode's startup function when the extension is loading up
function activate(context) {
	// Create the react based view interface by registering a class
	const provider = new ReactWebviewViewProvider(context.extensionPath, context.globalStorageUri);

	// Registers the class to the sidebar view
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'monishprojectapi-webview-panel',
			provider,
			{
				webviewOptions: { retainContextWhenHidden: true, enableScripts: true },
			}),

	);

	// Sidebar Button - Settings
	// Function - Goes to the settings page
	// Data Passed to the view - api key from the config
	context.subscriptions.push(
		vscode.commands.registerCommand('monishprojectapi.changeToSettingsBanner', () => {
			provider.postMessageToWebview({
				command: 'navigate',
				page: 'settings',
				apidata: provider.getConfigFile()['api'],
			});
		})
	);

	// Sidebar Button - Add New Project
	// Function - Goes to the add new project page
	context.subscriptions.push(
		vscode.commands.registerCommand('monishprojectapi.addProjectInConfig', () => {
			provider.postMessageToWebview({
				command: 'navigate',
				page: 'addnewproject',
			});
		})
	);

	// Sidebar Button - Export Config File
	// Function - Export the config file using native vscode upload prompts
	context.subscriptions.push(
		vscode.commands.registerCommand('monishprojectapi.exportConfig', () => {
			const configfileName = vscode.Uri.joinPath(context.globalStorageUri, configfileDocName);
			provider.downloadTheConfigFile(configfileName);
		})
	);

	// Sidebar Button - Import Config File
	// Function - Import a config file and stores it inside the globalStorage location
	context.subscriptions.push(
		vscode.commands.registerCommand('monishprojectapi.importConfig', () => {
			const configfileName = vscode.Uri.joinPath(context.globalStorageUri, configfileDocName);
			provider.importTheConfigFile(configfileName);
		})
	);


	// XML File System Provider
	const apiFileSystemProvider = {
		_onDidChangeFile: new vscode.EventEmitter(),
		get onDidChangeFile() { return this._onDidChangeFile.event; },

		// Triggered when VS Code opens the file
		async readFile(uri) {
			try {
				// Fetch the complete XML document from the xmlCache
				console.log(uri);
				const xmlString = await xmlCache.get(uri.path.replaceAll('/', ''))

				// Convert the raw string into a buffer for VS Code
				return Buffer.from(xmlString, 'utf8');

			} catch (error) {
				throw vscode.FileSystemError.FileNotFound(uri);
			}
		},

		// Triggered when the user hits Save (Ctrl+S / Cmd+S)
		async writeFile(uri, content, options) {
			const fileId = uri.path.replace(/^\//, '').replace('.xml', '');

			// Convert the editor content buffer back into a clean string
			const updatedXmlString = Buffer.from(content).toString('utf8');

			try {
				// Send the edited string back to the API
				await provider.saveXMLContentToAPI(fileId, updatedXmlString);

				this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
			} catch (err) {
				throw vscode.FileSystemError.NoPermissions(`API Save Failed: ${err.message}`);
			}
		},

		// Boilerplate required by VS Code to treat this as a standard file
		stat(uri) {
			return {
				type: vscode.FileType.File,
				ctime: Date.now(),
				mtime: Date.now(),
				size: 0
			};
		},
		readDirectory() { return []; },
		createDirectory() { },
		delete() { },
		rename() { },
		watch() { return { dispose: () => { } }; }
	};

	// Registering the XML Document Provider
	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(XML_SCHEME, apiFileSystemProvider, { isCaseSensitive: true })
	);
}

// React Based View App Provider
// Function contains every function used on the view interface 
class ReactWebviewViewProvider {
	constructor(extensionPath, extensionGlobalStorage) {
		this._extensionPath = extensionPath;
		this._extensionGlobalStorage = extensionGlobalStorage
		this._view = undefined;
		this.configfileDocName = configfileDocName;
		this.configfile = configfile;
	}

	//mandatory method to have on every webview called
	resolveWebviewView(webviewView, context, _token) {
		this._view = webviewView;

		// enabling the use of javascript inside of the view panel
		// configuring the options to only look for files on the folder 'dist-webview'
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this._extensionPath, 'dist-webview'))
			]
		};

		//Page Routing Event Listener
		//Listens to message (using vscode.postMessage) being posted from the view panel to the extension.js
		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case 'fetchNewProject':
					// message used to fetch a new project
					// a project path (link) is retrieved from an input from the view and used to fetch the project's details
					// validate : check if link format is correct
					// validate : check if link is not already available on the project list
					// validate : ensure no other fetch request is also called using the fetch process (isUsingAPI)
					const link = message.link;
					const regex = /^selfserve\/[a-z0-9A-Z]{3,}(\/?[a-z0-9A-Z]{3,})+(\/?[a-z0-9A-Z]+)?$/;
					const linkmatched = regex.test(link);

					if (!linkmatched) {
						vscode.window.showErrorMessage(`The provided project path should be in the format: "selfserve/xxxx/xxxx/xxxx"`);
					} else if (this.configfile.projects.some(prog => prog.path === link)) {
						vscode.window.showErrorMessage(`The provided project path has already been added to the project list.`);
					}
					else {
						if (!isUsingAPI) {
							this.fetchProjectPath(link);
						}
					}
					break;
				case 'updateApiKey':
					// message used to update the api key on the config file
					// an API input is retrieved from the view and saved to the config file to be later used for fetch requests
					const keyString = message.apiString;
					this.setApiKey(keyString);
					break;
				case 'testApiKey':
					// message used to test if the API key is correct or not by sending a GET request to the API
					// validate : ensure no other fetch request is also called using the fetch process (isUsingAPI)
					if (!isUsingAPI) {
						this.testAPI();
					}
					break;
				case 'fetchInitData':
					// message used during the loading of the view interface, used for retrieving the project lists from the config file and sending it to the view using the postMessageToWebview function
					// await is used here to wait for the updateConfig function to complete before sending the data to the view
					await this.updateConfig();

					this.postMessageToWebview({
						command: 'getInitData',
						projects: this.getConfigFile()['projects'],
					});
					break;
				case 'gotosettings':
					// message used to go to the settings page
					// on load, the API text from the config file is used as a placeholder on the API input text
					this.postMessageToWebview({
						command: 'navigate',
						page: 'settings',
						apidata: this.getConfigFile()['api'],
					});
					break;
				case 'openInEditor':
					if (!isUsingAPI) {
						this.openXMLDocument(message.projectid);
					}
					break;
				case 'setAsFavorite':
					// message used to set a project as the favorite project adding a pin to the top functionality
					this.setAsFavorite(message.projectid);
					break;
				case 'unsetAsFavorite':
					// message used to unset a project as the favorite project removing the pin to the top functionality
					this.unsetAsFavorite(message.projectid);
					break;
				case 'removeFromConfig':
					// message used to remove a project from the project list on the config file
					this.removeFromConfig(message.projectid);
					break
			}
		});


		// Mandatory Function - Add html to the view, which in this case is the react template index.html code
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

	}

	// Routing Function used to send messages from the extension.js to the view
	// The message contains variables to indicate which page to go to, special loading functions and data from the config file
	postMessageToWebview(message) {
		if (this._view) {
			this._view.webview.postMessage(message);
		}
	}

	// The function which creates the React index.html template using assets generated by a vite bundle
	// The template used is the recommended template for integrating React into VSCODE
	_getHtmlForWebview(webview) {
		//getting the css/js files generated/bundled by vite for the React app
		const scriptPathOnDisk = vscode.Uri.file(
			path.join(this._extensionPath, 'dist-webview', 'assets', 'main.js')
		);
		const stylePathOnDisk = vscode.Uri.file(
			path.join(this._extensionPath, 'dist-webview', 'assets', 'main.css')
		);

		const styleUri = webview.asWebviewUri(stylePathOnDisk);
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content=" default-src 'none';  font-src ${webview.cspSource} data:;  style-src ${webview.cspSource} 'unsafe-inline';  script-src ${webview.cspSource};">
				<link rel="stylesheet" href="${styleUri}">
                <title>Monish Project File Manager</title>
                <style>
                    body {
                        padding: 0;
                        margin: 0;
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                    }
                </style>
            </head>
            <body>
                <div id="root"></div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>
        `;
	}

	// Checks if the config file is available. If yes, save the config file to the object "this.configfile"
	// if no, create a new config file template on the globalStorage on the extension
	async updateConfig() {
		const configfileName = vscode.Uri.joinPath(this._extensionGlobalStorage, this.configfileDocName);

		if (await this.checkIfDirectoryIsAvailable()) {
			try {
				await this.saveJSONFileToObject(configfileName);
			} catch (error) {
				vscode.window.showErrorMessage(`File exists, but it contains invalid or corrupted JSON formatting: ${error}`);
			}
		} else {
			try {
				await this.saveObjectToJSONFile(configfileName);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to check for the config storage: ${error}`);
			}
		}
	}

	//Check if the directory is available and fix it
	//+return true if the config file is available
	async checkIfDirectoryIsAvailable() {
		let directoryFiles = {};
		await vscode.workspace.fs.createDirectory(this._extensionGlobalStorage);
		directoryFiles = await vscode.workspace.fs.readDirectory(this._extensionGlobalStorage);
		return directoryFiles.some(([name, type]) => name === this.configfileDocName);
	}

	//Find the config file on the directory and add it to the config file.
	//Use only if checkIfDirectoryIsAvailable is true
	async saveJSONFileToObject(configfileName) {
		const rawConfigAPIFile = await vscode.workspace.fs.readFile(configfileName);
		const stringConfigAPIFile = new TextDecoder('utf-8').decode(rawConfigAPIFile);
		this.configfile = JSON.parse(stringConfigAPIFile);
		console.log("Decoded Object data:", this.configfile);
	}

	//Convert the config object and store it as a JSON file
	//Use only if checkIfDirectoryIsAvailable is false
	async saveObjectToJSONFile(configfileName) {
		const newFiletextEncoder = new TextEncoder();
		const configfileJSON = newFiletextEncoder.encode(JSON.stringify(this.configfile, null, 4));
		await vscode.workspace.fs.writeFile(configfileName, configfileJSON);
		console.log("The config file has been saved:", this.configfile);
	}

	//get method for retriving the config object
	getConfigFile() {
		if (this.checkIfDirectoryIsAvailable()) {
			return this.configfile;
		}
	}

	// save the provided API string to the config object and also to the config file on the globalStorage
	// Validate : if the API key is the same, do not do anything and return
	async setApiKey(apiKeyString) {
		const configfileName = vscode.Uri.joinPath(this._extensionGlobalStorage, this.configfileDocName);

		if (!apiKeyString) return;
		if (this.configfile['api'] === apiKeyString) {
			vscode.window.showInformationMessage(`No change was made as the api key the same.`);
			return;
		}
		this.configfile['api'] = apiKeyString;

		if (await this.checkIfDirectoryIsAvailable()) {
			this.saveObjectToJSONFile(configfileName);
			vscode.window.showInformationMessage(`The api key: ${this.configfile['api']} has been saved.`);
		}

	}

	//download the config file from the globalStorage using VSCODE's showSaveDialog function
	// Validate : if the dialog is close or cancel, do not do anything and return
	async downloadTheConfigFile(configfileName) {
		const options = {
			defaultUri: vscode.Uri.file(configfileDocName),
			saveLabel: 'Export Config File',
			filters: {
				'All Files': ['*']
			}
		};
		let targetUri;

		if (await this.checkIfDirectoryIsAvailable()) {
			targetUri = await vscode.window.showSaveDialog(options);
		}

		if (!targetUri) return;

		await vscode.workspace.fs.copy(configfileName, targetUri, { overwrite: true });

		vscode.window.showInformationMessage(`The config file has been successfully exported.`);
		return targetUri;

	}

	//Upload a new config file to the globalStorage and the config object using VSCODE's showOpenDialog function
	//On save the view is reload to the homepage
	// Validate : Check if file is formatted using JSON
	// Validate : Check if API is a string type
	// Validate : Check if the project list is an array type
	async importTheConfigFile(configfileName) {
		const options = {
			canSelectMany: false,
			openLabel: 'Import Config File',
			filters: {
				'JSON': ['json']
			}
		};
		let targetUri;
		let sourceUri;
		let sourcefileData;
		let sourcefileName;
		let sourceFileJSON;
		let sourceFileObject;

		if (await this.checkIfDirectoryIsAvailable()) {
			targetUri = await vscode.window.showOpenDialog(options);
		}

		if (!targetUri) return;

		sourceUri = targetUri[0];
		sourcefileName = path.basename(sourceUri.fsPath);

		if (sourcefileName !== configfileDocName) {
			vscode.window.showErrorMessage(`Invalid file name. Expected "${configfileDocName}" but got "${sourcefileName}".`);
			return;
		}

		try {
			sourcefileData = await vscode.workspace.fs.readFile(sourceUri);
			sourceFileJSON = Buffer.from(sourcefileData).toString('utf8');
			sourceFileObject = JSON.parse(sourceFileJSON);

			if (!'api' in sourceFileObject || typeof sourceFileObject['api'] !== "string") {
				throw new Error('Missing or invalid key: "api" must be a string.');
			}

			if (!'projects' in sourceFileObject || !Array.isArray(sourceFileObject['projects'])) {
				throw new Error('Missing or invalid key: "projects" must be an array.');
			}

			await vscode.workspace.fs.writeFile(configfileName, sourcefileData);

			await this.updateConfig();

			vscode.window.showInformationMessage(`The file has been saved.`);

			this.postMessageToWebview({
				command: 'navigate',
				page: 'homepage',
				projects: this.getConfigFile()['projects'],
			});

		} catch (error) {
			vscode.window.showErrorMessage(`Invalid JSON content: Internal structural error : ${error}`);
		}
	}

	// Test the API server using a GET request
	async testAPI() {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Establishing connection to the Decipher API",
			cancellable: false,
		}, async () => {
			isUsingAPI = true;
			try {
				const response = await fetch(hostnameAPI + 'hello?name=Monish', {
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'x-apikey': this.configfile['api'],
					}
				});

				if (!response.ok) {
					throw new Error(`Server responded with status: ${response.status}`);
				}

				const data = await response.json();

				vscode.window.showInformationMessage(`${data.hello} has successfully gone to Decipher API and return back.`);
				isUsingAPI = false;
			} catch (error) {
				vscode.window.showErrorMessage(`API Error: ${error.message}`);
				isUsingAPI = false;
			}
		});
	}

	//fetch project details using the provided project path
	async fetchProjectPath(linkString) {
		const configfileName = vscode.Uri.joinPath(this._extensionGlobalStorage, this.configfileDocName);

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Fetching the project details...",
			cancellable: false,
		}, async () => {
			isUsingAPI = true;
			try {
				const response = await fetch(hostnameAPI + 'rh/surveys/' + linkString, {
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'x-apikey': this.configfile['api'],
					}
				});

				if (!response.ok) {
					throw new Error(`Server responded with status: ${response.status}`);
				}

				const data = await response.json();
				const projectData = {
					'path': data.path,
					'lastAccess': data.lastAccess,
					'title': data.title,
					'favorite': false,
					'id': "prog_" + data.path.replaceAll('/', '_'),
				}

				//console.log(projectData);
				this.configfile.projects.push(projectData);

				if (await this.checkIfDirectoryIsAvailable()) {
					this.saveObjectToJSONFile(configfileName);
				}

				this.postMessageToWebview({
					command: 'navigate',
					page: 'homepage',
					projects: this.getConfigFile()['projects'],
				});

				vscode.window.showInformationMessage(`"${data.title}" has successfully been added to the project list.`);
				isUsingAPI = false;
			} catch (error) {
				vscode.window.showErrorMessage(`API Error: ${error.message}`);
				isUsingAPI = false;
			}
		});
	}

	//set the provided projectid as a favorite project
	// the project list is reloaded after this
	async setAsFavorite(projectid) {
		const configfileName = vscode.Uri.joinPath(this._extensionGlobalStorage, this.configfileDocName);

		this.getConfigFile()['projects'].forEach(i => {
			if (i.id === projectid) {
				i.favorite = true;
			}
		})

		if (await this.checkIfDirectoryIsAvailable()) {
			this.saveObjectToJSONFile(configfileName);
		}

		this.postMessageToWebview({
			command: 'navigate',
			page: 'homepage',
			projects: this.getConfigFile()['projects'],
		});
	}

	//remove the provided projectid as a favorite project
	//the project list is reloaded after this
	async unsetAsFavorite(projectid) {
		const configfileName = vscode.Uri.joinPath(this._extensionGlobalStorage, this.configfileDocName);

		this.getConfigFile()['projects'].forEach(i => {
			if (i.id === projectid) {
				i.favorite = false;
			}
		})

		if (await this.checkIfDirectoryIsAvailable()) {
			this.saveObjectToJSONFile(configfileName);
		}

		this.postMessageToWebview({
			command: 'navigate',
			page: 'homepage',
			projects: this.getConfigFile()['projects'],
		});
	}

	//remove the projectid from the config's project list
	//the project list is reloaded after this
	async removeFromConfig(projectid) {
		const configfileName = vscode.Uri.joinPath(this._extensionGlobalStorage, this.configfileDocName);

		this.getConfigFile()['projects'] = this.getConfigFile()['projects'].filter(i => {
			return i.id !== projectid;
		})

		if (await this.checkIfDirectoryIsAvailable()) {
			this.saveObjectToJSONFile(configfileName);
		}

		this.postMessageToWebview({
			command: 'navigate',
			page: 'homepage',
			projects: this.getConfigFile()['projects'],
		});
	}


	//Open XML Document
	async openXMLDocument(projectid) {
		const projectInfo = this.configfile['projects'].find((item) => {
			return item.id === projectid;
		});
		const allTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

		if (allTabs.find(i => {
			return i.label.trim() === projectInfo.id + ".xml"
		})) {
			return;
		}

		try {
			const documentKey = `${projectInfo.id}.xml`;
			let rawXmlString;

			rawXmlString = await this.getCustomXML(projectInfo);

			if (!rawXmlString) {
				throw new Error('Failed to load the XML String');
			}

			// add the document in cache to remove it later to avoid leak
			await xmlCache.set(documentKey, rawXmlString);

			const uri = vscode.Uri.parse(`${XML_SCHEME}:///${documentKey}`);
			let doc;

			doc = await vscode.workspace.openTextDocument(uri);

			await vscode.languages.setTextDocumentLanguage(doc, 'xml');
			await vscode.window.showTextDocument(doc, { preview: false });

			// Once openTextDocument finishes reading the xml off the xmlCache, we remove the xml data from the xmlCache
			xmlCache.delete(documentKey);

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to display XML: ${error.message}`);
		}

	}

	//get the XML from the API using the project object
	async getCustomXML(projectinfo) {
		return await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Fetching the survey.xml file for "${projectinfo.title}"`,
			cancellable: false,
		}, async () => {
			isUsingAPI = true;
			try {
				const response = await fetch(hostnameAPI + 'surveys/' + projectinfo.path + '/files/survey.xml', {
					method: 'GET',
					headers: {
						'Accept': 'application/octet-stream',
						'x-apikey': this.configfile['api'],
					}
				});

				if (!response.ok) {
					throw new Error(`Fetching the survey.xml from the server responded with status: ${response.status}`);
				}

				let data;
				data = await response.text();

				// console.log(response);

				//vscode.window.showInformationMessage(`"${projectinfo.title}" has been fetched.`);
				isUsingAPI = false;

				return data;
			} catch (error) {
				vscode.window.showErrorMessage(`API Error: ${error.message}`);
				isUsingAPI = false;
				return '';
			}
		});
	}

	async saveXMLContentToAPI(fileId, xmlString) {
		if (!isUsingAPI) {

			const projectInfo = this.configfile['projects'].find((item) => {
				return item.id === fileId.trim();
			});
			const allTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

			if (!allTabs.find(i => {
				return (i.label.trim() === projectInfo.id + ".xml") && i.isDirty
			})) {
				return;
			}

			return await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Saving the survey.xml file for "${projectInfo.title}"`,
				cancellable: false,
			}, async () => {
				isUsingAPI = true;
				const formData = new FormData();
				formData.append("contents", xmlString);

				try {
					const response = await fetch(hostnameAPI + 'surveys/' + projectInfo.path + '/files/survey.xml', {
						method: 'PUT',
						headers: {
							'x-apikey': this.configfile['api'],
						},
						body: formData

					});

					if (!response.ok) {

						const errorData = await response.json();
						let additionalData;

						additionalData = [];
						
						errorData["extra"].forEach(i => {
							additionalData.push('Error'+ i.message +' at line:' + i.line)
						});



						console.log('Error"')
						console.log(errorData);

						throw new Error(`Saving the survey.xml from the server responded with an error: ${errorData["$error"]}\n\n ${additionalData.join('\n')}`);
					}

					let data;
					data = await response.json();

					isUsingAPI = false;

					// console.log('success:')
					// console.log(data);

					vscode.window.showInformationMessage(`"${projectInfo.title}" has been saved.`);

					return true;
				} catch (error) {
					vscode.window.showErrorMessage(`API Error: ${error.message}`);
					isUsingAPI = false;
					return false;
				}
			});
		} else {
			return;
		}
	}
}

module.exports = {
	activate
};