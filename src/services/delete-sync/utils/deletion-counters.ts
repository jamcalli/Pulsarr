/**
 * Record of a deletion for reporting/dry-run purposes
 */
export interface DeletionRecord {
  title: string
  guid: string
  instance: string
}

/**
 * Manages deletion statistics and records during delete sync operations
 */
export class DeletionCounters {
  // Movie counters
  moviesDeleted = 0
  moviesSkipped = 0
  moviesProtected = 0

  // Show counters
  endedShowsDeleted = 0
  endedShowsSkipped = 0
  continuingShowsDeleted = 0
  continuingShowsSkipped = 0
  showsProtected = 0

  // Deletion records for reporting
  moviesToDelete: DeletionRecord[] = []
  showsToDelete: DeletionRecord[] = []

  /**
   * Increment movie deleted counter and add to deletion records
   */
  incrementMovieDeleted(record: DeletionRecord): void {
    this.moviesDeleted++
    this.moviesToDelete.push(record)
  }

  /**
   * Increment movie skipped counter
   */
  incrementMovieSkipped(): void {
    this.moviesSkipped++
  }

  /**
   * Increment movie protected counter
   */
  incrementMovieProtected(): void {
    this.moviesProtected++
  }

  /**
   * Increment show deleted counter and add to deletion records
   * @param isContinuing - Whether the show is continuing (not ended)
   */
  incrementShowDeleted(record: DeletionRecord, isContinuing: boolean): void {
    if (isContinuing) {
      this.continuingShowsDeleted++
    } else {
      this.endedShowsDeleted++
    }
    this.showsToDelete.push(record)
  }

  /**
   * Increment show skipped counter
   * @param isContinuing - Whether the show is continuing (not ended)
   */
  incrementShowSkipped(isContinuing: boolean): void {
    if (isContinuing) {
      this.continuingShowsSkipped++
    } else {
      this.endedShowsSkipped++
    }
  }

  /**
   * Increment show protected counter
   */
  incrementShowProtected(): void {
    this.showsProtected++
  }

  /**
   * Get total deleted count across all types
   */
  get totalDeleted(): number {
    return (
      this.moviesDeleted + this.endedShowsDeleted + this.continuingShowsDeleted
    )
  }

  /**
   * Get total skipped count across all types
   */
  get totalSkipped(): number {
    return (
      this.moviesSkipped + this.endedShowsSkipped + this.continuingShowsSkipped
    )
  }

  /**
   * Get total protected count across all types
   */
  get totalProtected(): number {
    return this.moviesProtected + this.showsProtected
  }

  /**
   * Get total processed count (deleted + skipped + protected)
   */
  get totalProcessed(): number {
    return this.totalDeleted + this.totalSkipped + this.totalProtected
  }

  /**
   * Get total shows deleted (ended + continuing)
   */
  get totalShowsDeleted(): number {
    return this.endedShowsDeleted + this.continuingShowsDeleted
  }

  /**
   * Get total shows skipped (ended + continuing)
   */
  get totalShowsSkipped(): number {
    return this.endedShowsSkipped + this.continuingShowsSkipped
  }
}
