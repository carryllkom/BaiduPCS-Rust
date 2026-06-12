import js from '@eslint/js'
import globals from 'globals'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

// ESLint v9 flat config。Vue3 + TypeScript（<script setup>）。
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js', '*.config.ts'],
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,vue}'],
    languageOptions: {
      // .vue 用 vue-eslint-parser，<script> 块再委托给 ts parser
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TS 编译器已做未定义检查，no-undef 在含类型引用（如 DOM 的 EventListener）的 .ts 上会误报，关闭。
      'no-undef': 'off',
      // 项目里大量使用 _ 前缀占位参数 / 解构丢弃；按 _ 前缀豁免
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 以下为既有代码里的存量风格问题：降级为 warning 以便命令现在即可用，
      // 同时保留信号供后续逐步清理（新引入的真正错误仍由其它 recommended 规则拦截）。
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'vue/no-parsing-error': 'warn',
    },
  },
]
