import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('manifest icon asset exists', () => {
		const root = path.resolve(__dirname, '..', '..');
		const manifestPath = path.join(root, 'package.json');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		assert.ok(manifest.icon, 'package.json should declare an icon entry');
		const iconPath = path.join(root, manifest.icon);
		assert.ok(fs.existsSync(iconPath), `icon asset not found at ${manifest.icon}`);
		const iconStats = fs.statSync(iconPath);
		assert.ok(iconStats.isFile(), 'icon path must point at a file');
		assert.ok(iconStats.size > 0, 'icon file must not be empty');
	});
});
