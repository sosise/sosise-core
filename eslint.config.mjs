import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import unusedImports from "eslint-plugin-unused-imports";

export default [
    { files: ["**/*.{js,mjs,cjs,ts}"] },
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        "plugins": {
            'unused-imports': unusedImports
        },
        "rules": {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "unused-imports/no-unused-imports": "warn",
            "unused-imports/no-unused-vars": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "no-case-declarations": "off",
            "no-prototype-builtins": "off",
        }
    },
    {
        ignores: [
            "build/**",
            "node_modules/**",
            "doc/**",
            ".history/**",
            ".vscode/**",
            "eslint.config.mjs",
            "package-lock.json",
            "tsconfig.json",
            "package.json"
        ],
    }
];
