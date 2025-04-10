import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pen, Save, Trash2, X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface RouteCardHeaderProps {
  title: string;
  isNew?: boolean;
  isSaving: boolean;
  isDirty: boolean;
  isValid: boolean;
  enabled?: boolean;
  isTogglingState?: boolean;
  onToggleEnabled?: () => Promise<void>;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onTitleChange: (newTitle: string) => void;
}

const RouteCardHeader = ({
  title,
  isNew = false,
  isSaving,
  isDirty,
  isValid,
  enabled = true,
  isTogglingState = false,
  onToggleEnabled,
  onSave,
  onCancel,
  onDelete,
  onTitleChange,
}: RouteCardHeaderProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localTitle?.trim()) {
      onTitleChange(localTitle.trim());
      setIsEditing(false);
    }
  };

  const handleEscape = () => {
    setLocalTitle(title);
    setIsEditing(false);
  };

  const getBadgeVariant = () => {
    if (enabled) {
      return 'bg-green-500 hover:bg-green-500 text-white';
    } else {
      return 'bg-red-500 hover:bg-red-500 text-white';
    }
  };

  return (
    <CardHeader>
      <CardTitle className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-text">
          <div className="group/name inline-flex items-center gap-2 flex-1 min-w-0">
            {!isNew && onToggleEnabled && (
              <div className="flex items-center gap-2">
                <Badge 
                  variant="neutral" 
                  className={cn('px-2 py-0.5 h-7 text-sm', getBadgeVariant())}
                >
                  {enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                {isTogglingState ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
<Switch
  checked={enabled}
  onCheckedChange={() => onToggleEnabled && onToggleEnabled()} 
/>
                )}
              </div>
            )}
            {isEditing ? (
              <Input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                autoFocus
                className="w-full mr-4"
                disabled={isSaving}
                onBlur={handleSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit(e);
                  } else if (e.key === 'Escape') {
                    handleEscape();
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-2 pr-8">
                <span className={!enabled ? "opacity-50" : ""}>{title || 'Unnamed'}</span>
                {!isSaving && (
                  <Button
                    variant="noShadow"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0"
                    onClick={() => {
                      setLocalTitle(title);
                      setIsEditing(true);
                    }}
                  >
                    <Pen className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
  
          {/* Desktop buttons - horizontal layout */}
          <div className={`flex gap-2 ${isMobile ? "hidden" : "flex"}`}>
            {(isNew || isDirty) && (
              <Button
                variant="cancel"
                onClick={onCancel}
                className="flex items-center gap-2"
                disabled={isSaving}
                type="button"
              >
                <span>Cancel</span>
              </Button>
            )}
            <Button
              variant="blue"
              onClick={onSave}
              className="flex items-center gap-2"
              disabled={!isDirty || !isValid || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
            {onDelete && !isNew && (
              <Button
                variant="error"
                size="icon"
                onClick={onDelete}
                disabled={isSaving}
                className="transition-opacity"
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
  
          {/* Mobile buttons - vertical layout */}
          <div className={`flex flex-col gap-2 ${isMobile ? "flex" : "hidden"}`}>
            <Button
              variant="blue"
              onClick={onSave}
              className="flex items-center justify-center"
              disabled={!isDirty || !isValid || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
            
            {(isNew || isDirty) && (
              <Button
                variant="cancel"
                onClick={onCancel}
                className="flex items-center justify-center"
                disabled={isSaving}
                type="button"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            
            {onDelete && !isNew && (
              <Button
                variant="error"
                size="icon"
                onClick={onDelete}
                disabled={isSaving}
                className="transition-opacity"
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardTitle>
    </CardHeader>
  );
};

export default RouteCardHeader;