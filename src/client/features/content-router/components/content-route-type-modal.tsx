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

export type RouteType = 'genre' | 'year' // Add more route types as needed

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
 * Renders a modal dialog for selecting a routing type based on the content type.
 *
 * This component displays a dropdown with available route type options that are tailored to the content type 
 * (using 'radarr' for movies and 'sonarr' for shows). When a valid option is selected, clicking "Continue" 
 * triggers the onTypeSelect callback with the selected route type and closes the dialog.
 *
 * @param open - Controls whether the modal is visible.
 * @param onOpenChange - Callback to update the modal's open state.
 * @param onTypeSelect - Callback invoked with the selected route type when the user confirms their selection.
 * @param contentType - Specifies the content context, determining the wording of the route type descriptions.
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
    // Add more route types here
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
          <Button variant="neutralnoShadow" onClick={() => onOpenChange(false)}>
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
