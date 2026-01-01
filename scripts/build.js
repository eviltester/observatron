import fs from 'fs-extra'
import path from 'path'
import archiver from 'archiver'

const srcDir = path.join(process.cwd(), 'chrome')
const distDir = path.join(process.cwd(), 'dist')
const releaseDir = path.join(process.cwd(), 'release')

async function build() {
  console.log('🔨 Building Observatron extension...')

  try {
    // Check if source directory exists
    if (!await fs.pathExists(srcDir)) {
      throw new Error(`Source directory not found: ${srcDir}`)
    }

    // Clean dist directory
    if (await fs.pathExists(distDir)) {
      console.log('🧹 Cleaning dist directory...')
      await fs.remove(distDir)
    }

    // Copy source to dist
    console.log('📋 Copying chrome/ to dist/...')
    await fs.copy(srcDir, distDir)

    // Verify manifest exists
    const manifestPath = path.join(distDir, 'manifest.json')
    if (!await fs.pathExists(manifestPath)) {
      throw new Error('manifest.json not found in dist/')
    }

    // Validate manifest structure
    console.log('✅ Validating manifest.json...')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    if (!manifest.name || !manifest.version || !manifest.manifest_version) {
      throw new Error('Invalid manifest.json: missing required fields')
    }

    // Create release directory if it doesn't exist
    if (!await fs.pathExists(releaseDir)) {
      console.log('📁 Creating release directory...')
      await fs.mkdir(releaseDir)
    }

    // Create zip filename with version
    const zipFilename = `observatron-v-${manifest.version}.zip`
    const zipPath = path.join(releaseDir, zipFilename)

    // Create zip file
    console.log(`📦 Creating zip file: ${zipFilename}...`)
    await createZip(distDir, zipPath)

    console.log(`✅ Build complete! Extension version: ${manifest.version}`)
    console.log(`📦 Output directory: ${distDir}`)
    console.log(`📦 Zip file: ${zipPath}`)
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    process.exit(1)
  }
}

async function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    // Create output stream
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    })

    // Handle errors
    output.on('error', reject)
    archive.on('error', reject)

    // Handle completion
    archive.on('end', resolve)

    // Pipe archive data to the file
    archive.pipe(output)

    // Add all files from the source directory
    archive.directory(sourceDir, false)

    // Finalize the archive
    archive.finalize()
  })
}

build()
