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
  // Private movie counters
  private _moviesDeleted = 0
  private _moviesSkipped = 0
  private _moviesProtected = 0

  // Private show counters
  private _endedShowsDeleted = 0
  private _endedShowsSkipped = 0
  private _continuingShowsDeleted = 0
  private _continuingShowsSkipped = 0
  private _showsProtected = 0

  // Private deletion records for reporting
  private _moviesToDelete: DeletionRecord[] = []
  private _showsToDelete: DeletionRecord[] = []

  // Public getters for movie counters
  get moviesDeleted(): number {
    return this._moviesDeleted
  }
  get moviesSkipped(): number {
    return this._moviesSkipped
  }
  get moviesProtected(): number {
    return this._moviesProtected
  }

  // Public getters for show counters
  get endedShowsDeleted(): number {
    return this._endedShowsDeleted
  }
  get endedShowsSkipped(): number {
    return this._endedShowsSkipped
  }
  get continuingShowsDeleted(): number {
    return this._continuingShowsDeleted
  }
  get continuingShowsSkipped(): number {
    return this._continuingShowsSkipped
  }
  get showsProtected(): number {
    return this._showsProtected
  }

  // Public getters for deletion records (readonly to prevent external mutation)
  get moviesToDelete(): readonly DeletionRecord[] {
    return this._moviesToDelete
  }
  get showsToDelete(): readonly DeletionRecord[] {
    return this._showsToDelete
  }

  /**
   * Increment movie deleted counter and add to deletion records
   */
  incrementMovieDeleted(record: DeletionRecord): void {
    this._moviesDeleted++
    this._moviesToDelete.push(record)
  }

  /**
   * Increment movie skipped counter
   */
  incrementMovieSkipped(): void {
    this._moviesSkipped++
  }

  /**
   * Increment movie protected counter
   */
  incrementMovieProtected(): void {
    this._moviesProtected++
  }

  /**
   * Increment show deleted counter and add to deletion records
   * @param isContinuing - Whether the show is continuing (not ended)
   */
  incrementShowDeleted(record: DeletionRecord, isContinuing: boolean): void {
    if (isContinuing) {
      this._continuingShowsDeleted++
    } else {
      this._endedShowsDeleted++
    }
    this._showsToDelete.push(record)
  }

  /**
   * Increment show skipped counter
   * @param isContinuing - Whether the show is continuing (not ended)
   */
  incrementShowSkipped(isContinuing: boolean): void {
    if (isContinuing) {
      this._continuingShowsSkipped++
    } else {
      this._endedShowsSkipped++
    }
  }

  /**
   * Increment show protected counter
   */
  incrementShowProtected(): void {
    this._showsProtected++
  }

  /**
   * Get total deleted count across all types
   */
  get totalDeleted(): number {
    return (
      this._moviesDeleted +
      this._endedShowsDeleted +
      this._continuingShowsDeleted
    )
  }

  /**
   * Get total skipped count across all types
   */
  get totalSkipped(): number {
    return (
      this._moviesSkipped +
      this._endedShowsSkipped +
      this._continuingShowsSkipped
    )
  }

  /**
   * Get total protected count across all types
   */
  get totalProtected(): number {
    return this._moviesProtected + this._showsProtected
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
    return this._endedShowsDeleted + this._continuingShowsDeleted
  }

  /**
   * Get total shows skipped (ended + continuing)
   */
  get totalShowsSkipped(): number {
    return this._endedShowsSkipped + this._continuingShowsSkipped
  }
}
