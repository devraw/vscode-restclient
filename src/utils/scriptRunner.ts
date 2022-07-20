import { HttpRequest } from '../models/httpRequest';
import * as crypto from 'crypto';
import * as querystring from 'querystring';
import { window } from 'vscode';

const CombinedStream = require('combined-stream');
const busboy = require('busboy');

const stackLineRegex = /\(eval.+<anonymous>:(?<line>\d+):(?<column>\d+)\)/;

/**
 * Runs pre-script against an HttpRequest
 */
export class ScriptRunner {

    public constructor(public request: HttpRequest) { }

    public async execute(scriptLines: string | undefined): Promise<void> {
        if (!scriptLines) {
            return;
        }

        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

        const scriptFunction = new AsyncFunction("rc", scriptLines);
        
        let request = this.request;
        return new Promise(async (resolve, reject) => {
            try {
                await scriptFunction({request, crypto, querystring, CombinedStream, busboy});
                resolve();
            } catch(e) {
                this.showErrorMessage(e);
                reject(e);
            }
        });
    }

    private showErrorMessage(error) {
        let errorLine = '';
        if (error.stack) {
            const match = error.stack.match(stackLineRegex);

            if (match && match.groups?.line && match.groups?.column) {
                const line = Number(match?.groups?.line) - 2;
                const column = match?.groups?.column;
                errorLine = `${line}:${column}`;
            }
        }
        
        console.error(error.stack);
        window.showErrorMessage(error.stack.split("\n")[0] + (errorLine ? " at " + errorLine : ""));
    }
}