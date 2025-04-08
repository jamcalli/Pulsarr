import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useState } from 'react'

export type RouteType = 'genre' | 'year' | 'language' | 'user'

interface RouteTypeOption {
  id: RouteType
  title: string
  description: string
}

interface RouteTypeSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTypeSelect: (type: RouteType) => void
  contentType: 'radarr' | 'sonarr'
}

/**
 * Modal dialog for selecting a routing type.
 *
 * Renders a modal with a dropdown for choosing one of four routing options: "Genre Route", "Year Route", "Language Route", or "User Route". The option descriptions are tailored based on the provided content type ('radarr' for movies or 'sonarr' for shows). When an option is selected, clicking "Continue" invokes the onTypeSelect callback with the chosen route type and closes the modal.
 *
 * @param open - Controls whether the modal is visible.
 * @param onOpenChange - Callback to update the modal's open state.
 * @param onTypeSelect - Callback invoked with the selected routing option when "Continue" is clicked.
 * @param contentType - Specifies the content type (e.g., 'radarr' for movies or 'sonarr' for shows) to customize option descriptions.
 *
 * @returns A React element representing the route type selection modal.
 */
export function RouteTypeSelectionModal({
  open,
  onOpenChange,
  onTypeSelect,
  contentType,
}: RouteTypeSelectionModalProps) {
  const [selectedType, setSelectedType] = useState<RouteType | null>(null)

  const routeTypeOptions: RouteTypeOption[] = [
    {
      id: 'genre',
      title: 'Genre Route',
      description: `Route ${contentType === 'radarr' ? 'movies' : 'shows'} based on their genre`,
    },
    {
      id: 'year',
      title: 'Year Route',
      description: `Route ${contentType === 'radarr' ? 'movies' : 'shows'} based on release year`,
    },
    {
      id: 'language',
      title: 'Language Route',
      description: `Route ${contentType === 'radarr' ? 'movies' : 'shows'} based on their original language`,
    },
    {
      id: 'user',
      title: 'User Route',
      description: `Route ${contentType === 'radarr' ? 'movies' : 'shows'} based on the requesting user`,
    },
  ]

  const handleContinue = () => {
    if (selectedType) {
      onTypeSelect(selectedType)
      onOpenChange(false)
    }
  }

  // Get the selected option title for display in the trigger
  const getSelectedOptionTitle = () => {
    if (!selectedType) return ''
    const option = routeTypeOptions.find((opt) => opt.id === selectedType)
    return option ? option.title : ''
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text">Select Route Type</DialogTitle>
          <DialogDescription>
            Choose what type of routing rule you want to create
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-text">Route Type</div>
            <Select
              value={selectedType || ''}
              onValueChange={(value) => setSelectedType(value as RouteType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a route type">
                  {getSelectedOptionTitle()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {routeTypeOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-text text-muted-foreground mt-1">
                {
                  routeTypeOptions.find((opt) => opt.id === selectedType)
                    ?.description
                }
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selectedType} onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default RouteTypeSelectionModal
