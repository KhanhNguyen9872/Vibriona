const fs = require('fs')
const path = require('path')
const dir = path.join(process.cwd(), 'public', 'fonts')
const files = ['Roboto-Regular.woff', 'Roboto-Bold.woff', 'Roboto-RegularItalic.woff']
const outDir = path.join(process.cwd(), 'src', 'api', 'fonts')
fs.mkdirSync(outDir, { recursive: true })
const lines = ['// Generated from public/fonts/*.woff — chạy: node scripts/embed-fonts.cjs']
for (const f of files) {
  const name = f.replace('.woff', '').replace(/-/g, '')
  const buf = fs.readFileSync(path.join(dir, f))
  const b64 = buf.toString('base64')
  lines.push(`export const ${name} = '${b64}';`)
}
fs.writeFileSync(path.join(outDir, 'robotoWoffBase64.ts'), lines.join('\n'))
console.log('Written src/api/fonts/robotoWoffBase64.ts')
