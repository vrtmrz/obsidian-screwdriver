import tsParser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
// import * as sveltePlugin from "eslint-plugin-svelte";
// import svelteParser from "svelte-eslint-parser";
import { baseRules, obsidianRules } from "./eslint.config.common.mjs";

export default defineConfig([
	globalIgnores([
		// Build outputs and legacy files
		"**/build",
		"coverage",
		"**/main.js",
		"version-bump.mjs",
		"package.json",
		"**/*.json",
		"utilsdeno",
		"esbuild.config.mjs",
		"*.config.mjs",
		"*.mjs",
		"*.js",
	]),
	// ...sveltePlugin.configs["flat/base"],
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			globals: { ...globals.browser },
			parser: tsParser,
			parserOptions: {
				project: "./tsconfig.json",
				rootDir: "./",
			},
		},
		linterOptions: {
			reportUnusedDisableDirectives: false,
		},
		rules: {
			...baseRules,
			...obsidianRules,
		},
	},
	// {
	//     files: ["**/*.svelte"],
	//     languageOptions: {
	//         globals: { ...globals.browser },
	//         parser: svelteParser,
	//         parserOptions: {
	//             parser: tsParser,
	//             extraFileExtensions: [".svelte"],
	//             project: "./tsconfig.json",
	//             rootDir: "./",
	//         },
	//     },
	//     rules: {
	//         "no-unused-vars": "off",
	//         ...obsidianRules,
	//     },
	// },
]);
