import typescriptEslintPlugin from "@typescript-eslint/eslint-plugin";
import typescriptEslintParser from "@typescript-eslint/parser";

export default [{
    ignores: [
        "src/extension.js",
        "src/test/extension.test.js",
    ],
}, {
    files: ["**/*.ts"],
}, {
    plugins: {
        "@typescript-eslint": typescriptEslintPlugin,
    },

    languageOptions: {
        parser: typescriptEslintParser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn",
            {
                selector: "default",
                format: ["camelCase", "PascalCase"],
            },
            {
                selector: "objectLiteralProperty",
                modifiers: ["requiresQuotes"],
                format: null,
            }
        ],

        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",
    },
}];