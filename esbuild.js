const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * html2pdf runs inside the webview, so it has to be a file the packaged
 * extension can serve. node_modules is excluded from the .vsix, hence the copy
 * into media/.
 */
function vendorBrowserLibraries() {
	const targetDir = path.join(__dirname, 'media', 'vendor');
	const libraries = [
		['html2pdf.js', 'dist', 'html2pdf.bundle.min.js'],
		['mermaid', 'dist', 'mermaid.min.js']
	];

	fs.mkdirSync(targetDir, { recursive: true });

	for (const parts of libraries) {
		const source = path.join(__dirname, 'node_modules', ...parts);
		const name = parts[parts.length - 1];

		if (!fs.existsSync(source)) {
			throw new Error(`Cannot vendor ${name}: ${source} is missing. Run npm install first.`);
		}

		fs.copyFileSync(source, path.join(targetDir, name));
	}

	console.log('[build] vendored browser libraries into media/vendor');
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	vendorBrowserLibraries();

	const buildConfigs = [
		{
			entryPoints: ['src/extension.ts'],
			platform: 'node',
			outfile: 'dist/extension.js'
		},
		{
			entryPoints: ['src/extension.web.ts'],
			platform: 'browser',
			outfile: 'dist/extension.web.js'
		}
	];

	const contexts = await Promise.all(buildConfigs.map((config) => esbuild.context({
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
		...config
	})));

	if (watch) {
		await Promise.all(contexts.map((ctx) => ctx.watch()));
	} else {
		await Promise.all(contexts.map((ctx) => ctx.rebuild()));
		await Promise.all(contexts.map((ctx) => ctx.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
