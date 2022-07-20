import * as vscode from 'vscode';
import { TreeItemCollapsibleState, RelativePattern } from 'vscode';
import { Selector } from '../utils/selector';
import { SelectedRequest } from '../models/SelectedRequest';
import { RequestController } from '../controllers/requestController';

export class HttpTreeProvider implements vscode.TreeDataProvider<HttpClientItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<HttpClientItem | undefined> = new vscode.EventEmitter<HttpClientItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<HttpClientItem | undefined> = this._onDidChangeTreeData.event;

    private _requestController: RequestController;

    constructor() {}

    public setRequestController(requestController: RequestController): void {
        this._requestController = requestController;
    }

    public async run(item: HttpClientItem) {
        await openDocument(item.uri, item.range);
        this._requestController.run(item.range, item.document);
    }

    public async open(item: HttpClientItem) {
        openDocument(item.uri, item.range);
    }

    refresh(item: HttpClientItem): void {
        this._onDidChangeTreeData.fire(item);
    }

    getTreeItem(element: HttpClientItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HttpClientItem): Thenable<HttpClientItem[]> {
        return new Promise(async (resolve) => {
            let children = await this.getHttpClientItems(element);
            resolve(children);
        });
    }

    private async getHttpClientItems(element): Promise<Thenable<HttpClientItem[]>> {
        if (element) {
            if (element.contextValue === 'folder') {
                return Promise.resolve(element.children);
            }
            try {
                await vscode.workspace.fs.stat(element.uri);
            } catch {
                vscode.window.showInformationMessage(`${element.uri.toString(true)} does not exist`);
                return Promise.resolve([]);
            }

            return new Promise((resolve) => {
                vscode.workspace.openTextDocument(element.uri).then(async (document: vscode.TextDocument) => {
                    const selectedRanges = await Selector.getAllRequests(document);
                    if (selectedRanges) {
                        const clients = selectedRanges.map(selectedRange => {
                            return HttpClientItem.createRequestItem(document, element.uri, selectedRange.range, selectedRange.name);
                        });
                        resolve(clients);
                    }
                });
            });
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                if (vscode.window.activeTextEditor) {
                    let activeFile = [HttpClientItem.createFileItem(vscode.window.activeTextEditor?.document.uri)];
                    return Promise.resolve(activeFile);
                }
            } else {
                return this.getTreeData();
            }
            return Promise.resolve([]);
        }
    }

    private async getTreeData(): Promise<Thenable<HttpClientItem[]>> {
        let treeData: HttpClientItem[] = [];
        for (let workspaceFolder of vscode.workspace.workspaceFolders!) {
            const resultKey = "<result>";
            let result: HttpClientItem[] = [];
            let level = {[resultKey]: result};
            let httpFiles = await vscode.workspace.findFiles(new RelativePattern(workspaceFolder, '**/*.http'), '**/node_modules/**');
            httpFiles.sort((a, b) => a.path.localeCompare(b.path));
            for (let httpFile of httpFiles) {
                const relativePath = httpFile.path.substring(workspaceFolder.uri.path.length + 1);
                let prevPath = '';
                relativePath.split('/').reduce((prev, name, index, arr) => {
                    prevPath = prevPath + '/' + name;
                    if (!prev[name]) {
                        prev[name] = { [resultKey]: [] };
                        let uri = vscode.Uri.parse(workspaceFolder.uri.path + prevPath);
                        let isFile = index === arr.length - 1;
                        let item: HttpClientItem;
                        if (isFile) {
                            item = HttpClientItem.createFileItem(uri);
                        } else {
                            item = HttpClientItem.createFolderItem(uri, name);
                        }
                        item.children = prev[name][resultKey];
                        prev[resultKey].push(item);
                    }
                    return prev[name];
                }, level)
            }
            if (result.length > 0) {
                const rootItem = HttpClientItem.createFolderItem(workspaceFolder.uri, workspaceFolder.name);
                rootItem.children = result;
                treeData.push(rootItem);
            }
        }
        return treeData;
    }
}

export class HttpClientItem extends vscode.TreeItem {
    range : vscode.Range;
    selectedRequest: SelectedRequest;
    document: vscode.TextDocument;
    children: HttpClientItem[];

    private constructor(public readonly uri: vscode.Uri) {
        super(uri);
    }

    public static createFolderItem(uri: vscode.Uri, label?: string): HttpClientItem {
        const item = new HttpClientItem(uri);
        item.collapsibleState = TreeItemCollapsibleState.Collapsed;
        if (label) { item.label = label; }
        item.contextValue = "folder";
        return item;
    }

    public static createFileItem(uri: vscode.Uri): HttpClientItem {
        const item = new HttpClientItem(uri);
        item.collapsibleState = TreeItemCollapsibleState.Collapsed;
        item.contextValue = "file";
        item.command = {
            command: 'rest-client.openRequest',
            title: 'open',
            arguments: [item]
        };
        return item;
    }

    public static createRequestItem(document: vscode.TextDocument, uri: vscode.Uri, range: vscode.Range, label?: string): HttpClientItem {
        const item = new HttpClientItem(uri);
        item.collapsibleState = TreeItemCollapsibleState.None;
        if (label) { item.label = label; }
        item.contextValue = "request";
        item.command = {
            command: 'rest-client.openRequest',
            title: 'open',
            arguments: [item]
        };
        item.document = document;
        item.range = range;
        return item;
    }
}

async function openDocument(uri: vscode.Uri, range? : vscode.Range) {
    const tabGroups = vscode.window.tabGroups.all;
    if (tabGroups && tabGroups.length > 0) {
        for (const tabGroup of tabGroups) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()) {
                    await vscode.window.showTextDocument(uri, {preview: false, viewColumn: tabGroup.viewColumn, selection: range});
                    return;
                }
            }
        }
    }
    await vscode.window.showTextDocument(uri, {preview: false, viewColumn: vscode.ViewColumn.One, selection: range});
}