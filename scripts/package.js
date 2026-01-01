import fs from 'fs-extra'
import path from 'path'
import archiver from 'archiver'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distDir = path.join(__dirname, '..', 'dist')
const releaseDir = path.join(__dirname, '..', 'release')

async function packageExtension() {
  console.log('📦 Packaging Observatron extension...')

  try {
    // Ensure dist directory exists
    if (!await fs.pathExists(distDir)) {
      throw new Error('dist/ directory not found. Run `npm run build` first.')
    }

    // Ensure release directory exists
    await fs.ensureDir(releaseDir)

    // Read version from manifest
    const manifestPath = path.join(distDir, 'manifest.json')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    const version = manifest.version
    const outputFilename = path.join(releaseDir, `observatron-v-${version}.zip`)

    console.log(`📝 Creating package: ${outputFilename}`)

    // Create archive stream
    const output = fs.createWriteStream(outputFilename)
    const archive = archiver('zip', {
      zlib: { level: 9 }
    })

    // Listen for errors
    archive.on('error', (err) => {
      throw err
    })

    // Pipe archive data to file
    archive.pipe(output)

    // Add entire dist directory
    archive.directory(distDir, false)

    // Finalize archive
    await archive.finalize()

    console.log(`✅ Package created successfully: ${outputFilename}`)
    console.log(`📊 Package size: ${(archive.pointer() / 1024).toFixed(2)} KB`)
  } catch (error) {
    console.error('❌ Packaging failed:', error.message)
    process.exit(1)
  }
}

packageExtension()
