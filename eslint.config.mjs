import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import electronToolkit from '@electron-toolkit/eslint-config'
import vuePrettierConfig from '@vue/eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'release/**', '.gitignore']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  // .vue 的 <script lang="ts"> 块接 TS parser：vue-eslint-parser 默认用
  // espree 解析 script，遇 TS 语法（as 断言等）即 parse error（XkTour.vue
  // 前车之鉴——整文件不被 lint）。只接 parser 不接规则集——.ts 全量 lint
  // 另立任务
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } }
  },
  electronToolkit,
  vuePrettierConfig,
  {
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off'
    }
  }
]
