import { render, screen, within } from '@testing-library/react'
import { PipelineCard } from '@/features/home/components/analytics/pipeline-card'
import { setFormatLocale } from '@/lib/format'
import type { components } from '@/types/api.js'

const statuses = [
  { status: 'pending', count: 4 },
  { status: 'requested', count: 1 },
  { status: 'grabbed', count: 1 },
]

const instances: components['schemas']['InstanceBreakdown'][] = [1, 2].map(
  (id) => ({
    id,
    name: `Radarr ${id}`,
    type: 'radarr',
    total_items: 2,
    primary_items: 2,
    by_status: [
      { status: 'requested', count: 1 },
      { status: 'grabbed', count: 1 },
    ],
    by_content_type: [{ content_type: 'movie', count: 2 }],
  }),
)

function stage(label: string) {
  const block = screen.getByText(label).closest('div')
  if (!block) throw new Error(`missing stage ${label}`)
  return block
}

describe('PipelineCard', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('counts each item once at the top and placements per instance', () => {
    render(<PipelineCard statuses={statuses} instances={instances} />)

    expect(screen.getByText('2 requests')).toBeInTheDocument()
    expect(screen.queryByText('4 requests')).not.toBeInTheDocument()
    expect(within(stage('Requested')).getByText('1')).toBeInTheDocument()
    expect(within(stage('Grabbed')).getByText('1')).toBeInTheDocument()
    expect(within(stage('Notified')).getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Placements by instance')).toBeInTheDocument()
    expect(within(stage('Radarr 1')).getByText('2')).toBeInTheDocument()
    expect(within(stage('Radarr 2')).getByText('2')).toBeInTheDocument()
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument()
  })
})
