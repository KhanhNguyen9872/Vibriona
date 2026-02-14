import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: true, // Tắt để tăng tốc
        controlFlowFlatteningThreshold: 0.9,
        deadCodeInjection: false, // Tắt để tăng tốc
        deadCodeInjectionThreshold: 0.6,
        debugProtection: true, // Tắt để tăng tốc
        debugProtectionInterval: 1000,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'mangled',
        log: false, // Tắt log để tăng tốc
        numbersToExpressions: true, // Tắt để tăng tốc
        renameGlobals: false,
        selfDefending: true, // Tắt để tăng tốc (có thể bật lại nếu cần)
        simplify: false,
        splitStrings: false, // Tắt để tăng tốc
        splitStringsChunkLength: 1,
        stringArray: true,
        stringArrayCallsTransform: true, // Tắt để tăng tốc
        stringArrayCallsTransformThreshold: 1,
        stringArrayEncoding: ['rc4'], // Đổi từ rc4 sang base64 (nhanh hơn)
        stringArrayIndexShift: true, // Tắt để tăng tốc
        stringArrayRotate: true,
        stringArrayShuffle: true, // Tắt để tăng tốc
        stringArrayWrappersCount: 5, // Giảm số lượng wrappers
        stringArrayWrappersChainedCalls: true, // Tắt để tăng tốc
        stringArrayWrappersParametersMaxCount: 5,
        stringArrayWrappersType: 'variable',
        stringArrayThreshold: 1, // Giảm threshold để tăng tốc
        target: 'browser',
        transformObjectKeys: false, // Tắt để tăng tốc
        unicodeEscapeSequence: false // Tắt để tăng tốc
      },
    }),
  ],
  build: {
    sourcemap: false,
  },
})
