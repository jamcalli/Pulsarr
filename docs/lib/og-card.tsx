import { readFile } from 'node:fs/promises'
import type { ImageResponseOptions } from 'next/dist/compiled/@vercel/og/types'
import { appName } from '@/lib/shared'

const colors = {
  page: '#121317',
  card: '#26282f',
  edge: '#0b0b0d',
  text: '#ececec',
  muted: '#a8a8a8',
  teal: '#48a9a6',
}

const logoPromise = readFile('./assets/images/pulsarr.svg').then(
  (svg) => `data:image/svg+xml;base64,${svg.toString('base64')}`,
)

const fontsPromise = Promise.all([
  readFile('./assets/fonts/ChakraPetch-Medium.ttf'),
  readFile('./assets/fonts/ChakraPetch-Bold.ttf'),
]).then(
  ([medium, bold]): NonNullable<ImageResponseOptions['fonts']> => [
    { name: 'Chakra Petch', data: medium, weight: 500, style: 'normal' },
    { name: 'Chakra Petch', data: bold, weight: 700, style: 'normal' },
  ],
)

export async function ogImageOptions(): Promise<ImageResponseOptions> {
  return { width: 1200, height: 630, fonts: await fontsPromise }
}

interface OgCardProps {
  eyebrow: string
  title: string
  description?: string
  site: string
}

export async function OgCard({
  eyebrow,
  title,
  description,
  site,
}: OgCardProps) {
  const logo = await logoPromise
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        padding: '56px 64px 64px 56px',
        backgroundColor: colors.page,
        fontFamily: 'Chakra Petch',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          padding: '48px 56px',
          backgroundColor: colors.card,
          border: `3px solid ${colors.edge}`,
          borderRadius: 5,
          boxShadow: `12px 12px 0 ${colors.teal}`,
          color: colors.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src={logo} alt="" width={64} height={64} />
          <span style={{ fontSize: 40, fontWeight: 700 }}>{appName}</span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: colors.teal,
            }}
          >
            {eyebrow}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flexGrow: 1,
            gap: 20,
            paddingTop: 24,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: title.length > 28 ? 60 : 72,
              fontWeight: 700,
              lineHeight: 1.1,
              lineClamp: 2,
            }}
          >
            {title}
          </p>
          {description && (
            <p
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 500,
                lineHeight: 1.35,
                color: colors.muted,
                lineClamp: 3,
              }}
            >
              {description}
            </p>
          )}
        </div>
        <span style={{ fontSize: 24, fontWeight: 500, color: colors.muted }}>
          {site}
        </span>
      </div>
    </div>
  )
}
