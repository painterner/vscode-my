"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.prebuiltExtensionsLocation = void 0;
exports.scanForExtensions = scanForExtensions;
exports.getScannedBuiltinExtensions = getScannedBuiltinExtensions;
const fs_1 = require("fs");
const path = require("path");
const download_1 = require("./download");
async function scanForExtensions(rootPath, serverURI) {
    const result = [];
    async function getExtension(relativePosixFolderPath) {
        try {
            const packageJSONPath = path.join(rootPath, relativePosixFolderPath, 'package.json');
            if ((await fs_1.promises.stat(packageJSONPath)).isFile()) {
                return {
                    scheme: serverURI.scheme,
                    authority: serverURI.authority,
                    path: path.posix.join(serverURI.path, relativePosixFolderPath),
                };
            }
        }
        catch {
            return undefined;
        }
    }
    async function processFolder(relativePosixFolderPath) {
        const extension = await getExtension(relativePosixFolderPath);
        if (extension) {
            result.push(extension);
        }
        else {
            const folderPath = path.join(rootPath, relativePosixFolderPath);
            const entries = await fs_1.promises.readdir(folderPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.charAt(0) !== '.') {
                    await processFolder(path.posix.join(relativePosixFolderPath, entry.name));
                }
            }
        }
    }
    await processFolder('');
    return result;
}

function isWebExtension(manifest) {
    if (Boolean(manifest.browser)) {
        return true;
    }
    if (Boolean(manifest.main)) {
        return false;
    }
    // neither browser nor main
    if (typeof manifest.extensionKind !== 'undefined') {
        const extensionKind = Array.isArray(manifest.extensionKind) ? manifest.extensionKind : [manifest.extensionKind];
        if (extensionKind.indexOf('web') >= 0) {
            return true;
        }
    }
    if (typeof manifest.contributes !== 'undefined') {
        for (const id of ['debuggers', 'terminal', 'typescriptServerPlugins']) {
            if (manifest.contributes.hasOwnProperty(id)) {
                return false;
            }
        }
    }
    return true;
}


function scanBuiltinExtensions(extensionsRoot, exclude = []) {
    const scannedExtensions = [];

    try {
        const extensionsFolders = fs_1.readdirSync(extensionsRoot);
        for (const extensionFolder of extensionsFolders) {
            if (exclude.indexOf(extensionFolder) >= 0) {
                continue;
            }
            const packageJSONPath = path.join(extensionsRoot, extensionFolder, 'package.json');
            if (!fs_1.existsSync(packageJSONPath)) {
                continue;
            }
            const packageJSON = JSON.parse(fs_1.readFileSync(packageJSONPath).toString('utf8'));
            if (!isWebExtension(packageJSON)) {
                continue;
            }
            const children = fs_1.readdirSync(path.join(extensionsRoot, extensionFolder));
            const packageNLSPath = children.filter(child => child === 'package.nls.json')[0];
            const packageNLS = packageNLSPath ? JSON.parse(fs_1.readFileSync(path.join(extensionsRoot, extensionFolder, packageNLSPath)).toString()) : undefined;
            const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
            const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];

            scannedExtensions.push({
                extensionPath: extensionFolder,
                packageJSON,
                packageNLS,
                readmePath: readme ? path.join(extensionFolder, readme) : undefined,
                changelogPath: changelog ? path.join(extensionFolder, changelog) : undefined,
            });
        }
        return scannedExtensions;
    } catch (ex) {
        return scannedExtensions;
    }
}


exports.prebuiltExtensionsLocation = '.build/builtInExtensions';
async function getScannedBuiltinExtensions(vsCodeDevLocation) {
    // use the build utility as to not duplicate the code
    // const extensionsUtil = await Promise.resolve(`${path.join(vsCodeDevLocation, 'build', 'lib', 'extensions.js')}`).then(s => require(s));
    // console.log("extensionsUtil", `${path.join(vsCodeDevLocation, 'build', 'lib', 'extensions.js')}`)
    const localExtensions = scanBuiltinExtensions(path.join(vsCodeDevLocation, 'extensions'));
    const prebuiltExtensions = scanBuiltinExtensions(path.join(vsCodeDevLocation, exports.prebuiltExtensionsLocation));
    // const prebuiltExtensions = extensionsUtil.scanBuiltinExtensions(path.join(vsCodeDevLocation, exports.prebuiltExtensionsLocation));
    for (const ext of localExtensions) {
        let browserMain = ext.packageJSON.browser;
        if (browserMain) {
            if (!browserMain.endsWith('.js')) {
                browserMain = browserMain + '.js';
            }
            const browserMainLocation = path.join(vsCodeDevLocation, 'extensions', ext.extensionPath, browserMain);
            if (!(await (0, download_1.fileExists)(browserMainLocation))) {
                console.log(`${browserMainLocation} not found. Make sure all extensions are compiled (use 'yarn watch-web').`);
            }
        }
    }
    return localExtensions.concat(prebuiltExtensions);
    // return localExtensions;
}
