import type { LogValue } from '@root/types/logs.types'
import { flattenLogData } from '@/features/system/lib/logs/log-fields'

export function LogFields({ data }: { data: Record<string, LogValue> }) {
  const { fields, blocks } = flattenLogData(data)

  return (
    <div className="flex flex-col gap-2">
      {fields.length > 0 && (
        <dl className="grid grid-cols-[fit-content(45%)_minmax(0,1fr)] gap-x-3 font-mono text-xs leading-6 md:grid-cols-[max-content_minmax(0,1fr)] md:text-sm">
          {fields.map((field) => (
            <div key={field.key} className="contents">
              <dt className="wrap-anywhere text-muted-foreground">
                {field.key}
              </dt>
              <dd className="wrap-anywhere">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {blocks.map((block) => (
        <div key={block.key} className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{block.key}</span>
          <pre className="overflow-x-auto rounded-md bg-inset p-3 font-mono text-xs whitespace-pre">
            {block.value}
          </pre>
        </div>
      ))}
    </div>
  )
}
