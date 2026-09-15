import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import electronToolkit from '@electron-toolkit/eslint-config'
import vuePrettierConfig from '@vue/eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'release/**', '.gitignore']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  electronToolkit,
  vuePrettierConfig,
  {
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off'
    }
  }
]
