#!/usr/bin/env -S npx tsx

/**
 * Optimized IMDb Ratings Filter
 *
 * Generates a pre-filtered ratings dataset excluding:
 * - tvEpisode entries
 * - videoGame entries
 *
 * Outputs in original TSV format with compression analysis
 */

import { createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createGzip } from 'node:zlib'
import { streamLines } from '../src/utils/streaming-updater.js'

const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz'
const IMDB_BASICS_URL = 'https://datasets.imdbws.com/title.basics.tsv.gz'

const USER_AGENT = 'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'
const TIMEOUT = 600_000 // 10 minutes

// Excluded content types (episodes and video games)
const EXCLUDED_TYPES = new Set(['tvEpisode', 'videoGame'])

type ContentType =
  | 'tvSeries'
  | 'movie'
  | 'tvEpisode'
  | 'short'
  | 'tvMovie'
  | 'tvMiniSeries'
  | 'tvSpecial'
  | 'video'
  | 'videoGame'
  | 'tvShort'
  | 'documentary'
  | 'tvPilot'

interface ContentTypeStats {
  [key: string]: number
}

interface GenerationResult {
  originalCount: number
  filteredCount: number
  outputGzFile: string
}

async function generateFilteredRatings(): Promise<GenerationResult> {
  console.log('=== GENERATING FILTERED RATINGS DATASET ===')

  // Step 1: Build allow-list of content IDs (exclude episodes and video games)
  console.log('\nStep 1: Building content type filter...')
  const allowedIds = new Set<string>()
  const typeStats: ContentTypeStats = {}
  let lineIdx = 0

  for await (const line of streamLines({
    url: IMDB_BASICS_URL,
    isGzipped: true,
    userAgent: USER_AGENT,
    timeout: TIMEOUT,
    retries: 2,
  })) {
    if (lineIdx++ === 0) continue // skip header

    const columns = line.split('\t')
    if (columns.length >= 2) {
      const tconst = columns[0]
      const titleType = columns[1] as ContentType

      if (tconst?.startsWith('tt')) {
        typeStats[titleType] = (typeStats[titleType] || 0) + 1

        // Include everything EXCEPT excluded types
        if (!EXCLUDED_TYPES.has(titleType)) {
          allowedIds.add(tconst)
        }
      }
    }

    if (lineIdx % 500_000 === 0) {
      console.log(
        `  Processed ${lineIdx.toLocaleString()} basics (${allowedIds.size.toLocaleString()} allowed)...`,
      )
    }
  }

  console.log('\nContent type statistics:')
  const sortedTypes = Object.entries(typeStats).sort((a, b) => b[1] - a[1])
  for (const [type, count] of sortedTypes) {
    const status = EXCLUDED_TYPES.has(type) ? '❌ EXCLUDED' : '✅ included'
    console.log(`  ${type}: ${count.toLocaleString()} ${status}`)
  }
  console.log(`\nAllowed content IDs: ${allowedIds.size.toLocaleString()}`)

  // Step 2: Filter ratings dataset
  console.log('\nStep 2: Filtering ratings dataset...')

  const outputGzFile = 'title.ratings.filtered.tsv.gz'

  // Create only compressed stream
  const gzipStream = createGzip({ level: 9 }) // Maximum compression
  const gzStream = createWriteStream(outputGzFile)

  // Pipe gzip stream
  gzipStream.pipe(gzStream)

  let originalCount = 0
  let filteredCount = 0
  lineIdx = 0

  for await (const line of streamLines({
    url: IMDB_RATINGS_URL,
    isGzipped: true,
    userAgent: USER_AGENT,
    timeout: TIMEOUT,
    retries: 2,
  })) {
    if (lineIdx++ === 0) {
      // Write header
      const header = `${line}\n`
      gzipStream.write(header)
      continue
    }

    originalCount++

    const [tconst] = line.split('\t')

    if (tconst && allowedIds.has(tconst)) {
      filteredCount++
      const dataLine = `${line}\n`
      gzipStream.write(dataLine)
    }

    if (originalCount % 100_000 === 0) {
      console.log(
        `  Processed ${originalCount.toLocaleString()} ratings (${filteredCount.toLocaleString()} kept)...`,
      )
    }
  }

  // Close stream
  gzipStream.end()

  // Wait for file to be written
  await new Promise<void>((resolve) => gzStream.on('close', resolve))

  console.log('\nFiltering complete:')
  console.log(`  Original ratings: ${originalCount.toLocaleString()}`)
  console.log(`  Filtered ratings: ${filteredCount.toLocaleString()}`)
  console.log(
    `  Reduction: ${(((originalCount - filteredCount) / originalCount) * 100).toFixed(1)}%`,
  )

  return { originalCount, filteredCount, outputGzFile }
}

async function analyzeCompression(results: GenerationResult): Promise<void> {
  console.log('\n=== COMPRESSION ANALYSIS ===')

  const { outputGzFile } = results

  try {
    const gzStats = await stat(outputGzFile)
    const gzSize = gzStats.size

    console.log('\nFile size:')
    console.log(`  ${outputGzFile}: ${(gzSize / 1024 / 1024).toFixed(1)} MB`)

    // Compare to original dataset size (estimate)
    const originalEstimate = 1_609_173 // From analysis
    const currentSize = results.filteredCount
    const dataReduction = (
      ((originalEstimate - currentSize) / originalEstimate) *
      100
    ).toFixed(1)

    console.log('\nOverall optimization:')
    console.log(
      `  Original dataset: ~${originalEstimate.toLocaleString()} entries`,
    )
    console.log(`  Filtered dataset: ${currentSize.toLocaleString()} entries`)
    console.log(`  Data reduction: ${dataReduction}% fewer entries`)
    console.log(
      `  Final compressed size: ${(gzSize / 1024 / 1024).toFixed(1)} MB`,
    )
  } catch (err) {
    console.error(
      'Error analyzing file sizes:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

async function main(): Promise<void> {
  console.log('Optimized IMDb Ratings Filter')
  console.log(`User-Agent: ${USER_AGENT}`)
  console.log(`Timeout: ${TIMEOUT / 1000}s`)
  console.log(`Excluding: ${Array.from(EXCLUDED_TYPES).join(', ')}\n`)

  try {
    const results = await generateFilteredRatings()
    await analyzeCompression(results)

    console.log('\n✅ Filtered dataset generated successfully!')
    console.log(`📁 File created: ${results.outputGzFile}`)
  } catch (error) {
    console.error(
      '❌ Generation failed:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  }
}

main().catch(console.error)
