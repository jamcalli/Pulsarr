import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pen, Save, Trash2, X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

interface EditableCardHeaderProps {
  title: string;
  isNew?: boolean;
  isSaving: boolean;
  isDirty: boolean;
  isValid: boolean;
  badge?: {
    text: string;
    className?: string;
  };
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onTitleChange: (newTitle: string) => void;
}

const EditableCardHeader = ({
  title,
  isNew = false,
  isSaving,
  isDirty,
  isValid,
  badge,
  onSave,
  onCancel,
  onDelete,
  onTitleChange,
}: EditableCardHeaderProps) => {
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

  return (
    <CardHeader>
      <CardTitle className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-text">
          <div className="group/name inline-flex items-center gap-2 flex-1 min-w-0">
            {badge && (
              <Badge className={badge.className || "text-sm bg-blue"}>
                <span className={isMobile ? "hidden" : "block"}>{badge.text}</span>
                <span className={isMobile ? "block" : "hidden"}>
                  {badge.text === "Default" ? "D" : badge.text}
                </span>
              </Badge>
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
                <span>{title || 'Unnamed'}</span>
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

export default EditableCardHeader;