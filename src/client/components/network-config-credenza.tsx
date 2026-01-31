import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { useConfigStore } from '@/stores/configStore'

type DeploymentType =
  | 'native-same'
  | 'native-different'
  | 'docker-same'
  | 'docker-different'
  | 'https-proxy'

interface DeploymentPreset {
  label: string
  description: string
  baseUrl: string
  port: number
}

const DEPLOYMENT_PRESETS: Record<DeploymentType, DeploymentPreset> = {
  'native-same': {
    label: 'Native (same machine as *arrs)',
    description: 'Pulsarr and Sonarr/Radarr on the same machine',
    baseUrl: 'http://localhost',
    port: 3003,
  },
  'native-different': {
    label: 'Native (different machine)',
    description: 'Enter the IP address of your Pulsarr server',
    baseUrl: 'http://',
    port: 3003,
  },
  'docker-same': {
    label: 'Docker (same network as *arrs)',
    description: 'Pulsarr container on same Docker network',
    baseUrl: 'http://pulsarr',
    port: 3003,
  },
  'docker-different': {
    label: 'Docker (different network)',
    description: 'Enter the IP address of your Pulsarr host',
    baseUrl: 'http://',
    port: 3003,
  },
  'https-proxy': {
    label: 'HTTPS (reverse proxy)',
    description: 'Enter your domain (e.g., https://pulsarr.example.com)',
    baseUrl: 'https://',
    port: 443,
  },
}

interface NetworkConfigCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRetry?: () => Promise<void>
  errorMessage?: string
}

/**
 * Responsive modal for configuring Pulsarr's network settings (baseUrl and port).
 * Opens when Radarr/Sonarr webhook callbacks fail due to connectivity issues.
 */
export function NetworkConfigCredenza({
  open,
  onOpenChange,
  onRetry,
  errorMessage,
}: NetworkConfigCredenzaProps) {
  const { config, updateConfig } = useConfigStore()

  const [deploymentType, setDeploymentType] =
    useState<DeploymentType>('native-same')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || 'http://localhost')
  const [port, setPort] = useState(config?.port || 3003)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success'>(
    'idle',
  )

  // Sync local state when config changes or modal opens
  useEffect(() => {
    if (open && config) {
      setBaseUrl(config.baseUrl || 'http://localhost')
      setPort(config.port || 3003)
    }
  }, [open, config])

  // HTTPS uses default port 443, so don't show port in preview
  const isHttps = baseUrl.startsWith('https://')
  const webhookPreviewUrl = isHttps
    ? `${baseUrl}/v1/`
    : `${baseUrl}:${port}/v1/`

  const handlePresetChange = (value: DeploymentType) => {
    setDeploymentType(value)
    const preset = DEPLOYMENT_PRESETS[value]
    setBaseUrl(preset.baseUrl)
    setPort(preset.port)
  }

  const handleSave = async () => {
    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      await Promise.all([updateConfig({ baseUrl, port }), minimumLoadingTime])

      setSaveStatus('success')
      toast.success('Network settings saved')

      // Show success state briefly before retrying
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))

      // If retry callback provided, attempt to retry the connection
      // The testConnection hook clears webhookError on start, and sets it again on failure
      // So if retry succeeds, webhookError becomes null and credenza closes automatically
      // If retry fails with webhook error, webhookError gets set and credenza stays open
      if (onRetry) {
        await onRetry()
      }

      setSaveStatus('idle')
    } catch (error) {
      // Config save failed
      toast.error(
        error instanceof Error ? error.message : 'Failed to save settings',
      )
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setSaveStatus('idle')
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus !== 'idle') return
    onOpenChange(newOpen)
    if (!newOpen) {
      setSaveStatus('idle')
    }
  }

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaContent className="sm:max-w-md">
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Configure Network Settings
          </CredenzaTitle>
          <CredenzaDescription>
            Radarr/Sonarr couldn't reach Pulsarr's webhook endpoint. Configure
            the address below that Radarr/Sonarr should use to reach Pulsarr
            (must be resolvable from their perspective, not your browser).
          </CredenzaDescription>
        </CredenzaHeader>

        <CredenzaBody className="space-y-4">
          {errorMessage && (
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection Failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="deployment-type" className="text-foreground">
              Deployment Type
            </Label>
            <Select value={deploymentType} onValueChange={handlePresetChange}>
              <SelectTrigger id="deployment-type">
                <SelectValue placeholder="Select deployment type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEPLOYMENT_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-foreground">
              {DEPLOYMENT_PRESETS[deploymentType].description}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-url" className="text-foreground">
              Base URL
            </Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost"
              disabled={saveStatus !== 'idle'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="port" className="text-foreground">
              Port{' '}
              {isHttps && (
                <span className="text-xs font-normal">
                  (not used for HTTPS)
                </span>
              )}
            </Label>
            <Input
              id="port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              placeholder="3003"
              disabled={saveStatus !== 'idle' || isHttps}
            />
          </div>

          <p className="text-xs text-gray-500 mt-1">
            Webhook URL Preview:{' '}
            <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded-xs">
              {webhookPreviewUrl}
            </code>
          </p>
        </CredenzaBody>

        <CredenzaFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="neutral"
            onClick={() => handleOpenChange(false)}
            disabled={saveStatus !== 'idle'}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleSave}
            disabled={saveStatus !== 'idle'}
            className="min-w-30 flex items-center justify-center gap-2"
          >
            {saveStatus === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveStatus === 'success' ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              'Save & Retry'
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
