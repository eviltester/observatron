import fs from 'fs-extra'
import path from 'path'

const srcDir = path.join(process.cwd(), 'chrome')
const distDir = path.join(process.cwd(), 'dist')

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

    console.log(`✅ Build complete! Extension version: ${manifest.version}`)
    console.log(`📦 Output directory: ${distDir}`)
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    process.exit(1)
  }
}

build()
