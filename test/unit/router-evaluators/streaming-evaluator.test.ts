import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StreamingEvaluator } from '../../../src/router-evaluators/streaming-evaluator'
import type {
  ContentMetadata,
  RouteCondition,
} from '../../../src/types/router.types'
import type { TmdbMetadata } from '../../../src/schemas/tmdb/tmdb.schema'

describe('StreamingEvaluator', () => {
  let evaluator: StreamingEvaluator

  beforeEach(() => {
    evaluator = new StreamingEvaluator()
  })

  describe('constructor', () => {
    it('should initialize with correct name', () => {
      expect(evaluator.name).toBe('streaming')
    })

    it('should define streamingServices field', () => {
      const fields = evaluator.supportedFields
      expect(fields).toHaveLength(1)
      expect(fields[0].name).toBe('streamingServices')
      expect(fields[0].label).toBe('Streaming Services')
      expect(fields[0].type).toBe('multi-select')
    })

    it('should support correct operators for streamingServices', () => {
      const operators = evaluator.supportedOperators?.streamingServices
      expect(operators).toBeDefined()
      expect(operators).toEqual(['includes', 'excludes'])
    })
  })

  describe('evaluate - includes operator', () => {
    it('should return true when content has matching streaming provider', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8], // Netflix
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should return true when content has multiple matching providers', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8, 9], // Netflix, Amazon Prime
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                  {
                    logo_path: '/logo2.jpg',
                    provider_id: 9,
                    provider_name: 'Amazon Prime Video',
                    display_priority: 2,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should return true when any provider in array matches', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8, 384], // Netflix, HBO Max
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should return false when no providers match', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [384], // HBO Max
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should return false when tmdbMetadata is undefined', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {}

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should return false when watchProviders is undefined', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should return false when watchProviders.results is empty', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {},
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should check buy providers when flatrate is not available', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                buy: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should check rent providers when flatrate and buy are not available', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                rent: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should check all provider types (flatrate, buy, rent)', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8, 9, 10],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
                buy: [
                  {
                    logo_path: '/logo2.jpg',
                    provider_id: 9,
                    provider_name: 'Amazon',
                    display_priority: 2,
                  },
                ],
                rent: [
                  {
                    logo_path: '/logo3.jpg',
                    provider_id: 10,
                    provider_name: 'Vudu',
                    display_priority: 3,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should handle single value (number) instead of array', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: 8, // Single number
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should handle empty value array', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })
  })

  describe('evaluate - excludes operator', () => {
    it('should return true when content does not have excluded provider', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [384], // HBO Max
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should return false when content has excluded provider', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [8], // Netflix
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should return false when any excluded provider is present', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [8, 384], // Netflix, HBO Max
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 384,
                    provider_name: 'HBO Max',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should return true when no providers are present', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {},
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should return true when tmdbMetadata is undefined', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [8],
      }

      const metadata: ContentMetadata = {}

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should check all provider types for exclusion', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [10],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                rent: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 10,
                    provider_name: 'Vudu',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should handle single value (number) for excludes', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: 8, // Single number
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 9,
                    provider_name: 'Amazon',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should handle empty value array for excludes', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'excludes',
        value: [],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })
  })

  describe('evaluate - edge cases', () => {
    it('should handle undefined condition value', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: undefined as any,
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should handle null condition value', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: null as any,
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should return false for unsupported operator', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'equals' as any,
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should handle providers with null/undefined values', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: undefined as any,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })

    it('should handle multiple regions and use first available', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
              GB: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 9,
                    provider_name: 'Amazon',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      // Should match from US region
      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })

    it('should handle large provider arrays efficiently', () => {
      const condition: RouteCondition = {
        field: 'streamingServices',
        operator: 'includes',
        value: Array.from({ length: 100 }, (_, i) => i), // 0-99
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: Array.from({ length: 50 }, (_, i) => ({
                  logo_path: `/logo${i}.jpg`,
                  provider_id: i + 50, // 50-99
                  provider_name: `Provider ${i}`,
                  display_priority: i,
                })),
              },
            },
          },
        },
      }

      // Should find overlap between 50-99
      expect(evaluator.evaluate(condition, metadata)).toBe(true)
    })
  })

  describe('evaluate - invalid field', () => {
    it('should return false for unsupported field', () => {
      const condition: RouteCondition = {
        field: 'invalidField' as any,
        operator: 'includes',
        value: [8],
      }

      const metadata: ContentMetadata = {
        tmdbMetadata: {
          details: {} as TmdbMetadata['details'],
          watchProviders: {
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1234/watch',
                flatrate: [
                  {
                    logo_path: '/logo.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 1,
                  },
                ],
              },
            },
          },
        },
      }

      expect(evaluator.evaluate(condition, metadata)).toBe(false)
    })
  })
})