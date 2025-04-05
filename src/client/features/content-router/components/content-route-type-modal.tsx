import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useState } from 'react'

export type RouteType = 'genre' | 'year' // Add more route types as needed

interface RouteTypeOption {
  id: RouteType
  title: string
  description: string
  icon: React.ReactNode
}

interface RouteTypeSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTypeSelect: (type: RouteType) => void
  contentType: 'radarr' | 'sonarr'
}

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
      icon: (
        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
          <span className="text-lg font-semibold">G</span>
        </div>
      ),
    },
    {
      id: 'year',
      title: 'Year Route',
      description: `Route ${contentType === 'radarr' ? 'movies' : 'shows'} based on release year`,
      icon: (
        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
          <span className="text-lg font-semibold">Y</span>
        </div>
      ),
    },
    // Add more route types here
  ]

  const handleContinue = () => {
    if (selectedType) {
      onTypeSelect(selectedType)
      onOpenChange(false)
    }
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

        <div className="grid gap-4 py-4">
          {routeTypeOptions.map((option) => (
            <Card
              key={option.id}
              className={`p-4 cursor-pointer ${
                selectedType === option.id ? 'border-2 border-primary' : ''
              }`}
              onClick={() => setSelectedType(option.id)}
            >
              <div className="flex items-center gap-4">
                {option.icon}
                <div>
                  <h3 className="font-medium text-text">{option.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
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
