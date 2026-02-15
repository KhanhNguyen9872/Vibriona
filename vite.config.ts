import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.8,
  deadCodeInjection: false,
  deadCodeInjectionThreshold: 0.6,
  debugProtection: true,
  debugProtectionInterval: 1000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'mangled',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: true,
  simplify: false,
  splitStrings: false,
  splitStringsChunkLength: 1,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 5,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 5,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 1,
  target: 'browser',
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
}

export default defineConfig(({ command }) => {
  const isBuild = command === 'build'

  return {
    base: '/',
    optimizeDeps: {
      include: ['@react-pdf/renderer', 'file-saver'],
    },
    plugins: [
      react(),
      tailwindcss(),
      // @ts-expect-error -- extracted options lose literal types; plugin accepts this shape at runtime
      ...(isBuild ? [obfuscatorPlugin({ options: obfuscatorOptions })] : []),
    ],
    build: {
      sourcemap: false, // only applies to `vite build` output; dev server keeps source maps for debugging
    },
  }
})
