#!/usr/bin/env tsx
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// Helper to wait for a condition
async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 30000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Timeout waiting for condition')
}

// Check if server is running
async function isServerRunning(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

// Generate OpenAPI spec
async function generateOpenAPISpec() {
  const port = process.env.PORT || 3003
  const baseUrl = process.env.baseUrl || `http://localhost:${port}`
  let serverProcess: ReturnType<typeof spawn> | null = null

  try {
    // Check if server is already running
    const alreadyRunning = await isServerRunning(
      `${baseUrl}/api/docs/openapi.json`,
    )

    if (!alreadyRunning) {
      console.log('Starting server to generate OpenAPI spec...')

      // Build the server first
      console.log('Building server...')
      const buildProcess = spawn('npm', ['run', 'build:server'], {
        stdio: 'inherit',
        shell: true,
      })

      await new Promise((resolve, reject) => {
        buildProcess.on('exit', (code) => {
          if (code === 0) resolve(undefined)
          else
            reject(
              new Error(
                `Server build failed with exit code ${code}. Check build logs above.`,
              ),
            )
        })
        buildProcess.on('error', (error) => {
          reject(new Error(`Failed to start build process: ${error.message}`))
        })
      })

      // Start the server with authentication disabled for OpenAPI generation
      serverProcess = spawn('node', ['dist/server.js'], {
        stdio: 'pipe',
        shell: true,
        env: {
          ...process.env,
          PORT: String(port),
          NODE_ENV: 'production',
          authenticationMethod: 'disabled',
          baseUrl: baseUrl,
          HOST: '127.0.0.1', // Restrict to localhost for security
        },
      })

      serverProcess.stdout?.on('data', (data) => {
        console.log(`Server: ${data.toString().trim()}`)
      })

      serverProcess.stderr?.on('data', (data) => {
        console.error(`Server Error: ${data.toString().trim()}`)
      })

      // Wait for server to be ready
      console.log('Waiting for server to start...')
      await waitFor(() => isServerRunning(`${baseUrl}/api/docs/openapi.json`))
      console.log('Server is ready!')
    }

    // Fetch the OpenAPI spec
    const specUrl = `${baseUrl}/api/docs/openapi.json`
    console.log(`Fetching OpenAPI spec from ${specUrl}...`)
    const response = await fetch(specUrl)

    if (!response.ok) {
      const text = await response.text()
      console.error('Response body:', text.substring(0, 500))
      throw new Error(
        `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
      )
    }

    const spec = await response.json()

    // Ensure directory exists
    const outputPath = resolve(process.cwd(), 'docs/static/openapi.json')
    mkdirSync(dirname(outputPath), { recursive: true })

    // Write OpenAPI spec
    writeFileSync(outputPath, JSON.stringify(spec, null, 2))
    console.log(`✅ OpenAPI spec generated at: ${outputPath}`)
  } catch (error) {
    console.error('❌ Error generating OpenAPI spec:', error)
    process.exit(1)
  } finally {
    // Kill the server if we started it
    if (serverProcess) {
      console.log('\nStopping server...')
      try {
        serverProcess.kill('SIGTERM')
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Check if process is still running before SIGKILL
        if (!serverProcess.killed) {
          console.log(
            'Server did not terminate gracefully, forcing shutdown...',
          )
          serverProcess.kill('SIGKILL')
        }
      } catch (error) {
        console.warn('Error during server cleanup:', error)
      }
    }
  }

  process.exit(0)
}

// Run the generator
generateOpenAPISpec()
