import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pen, Save, Trash2, X } from 'lucide-react';

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
                <span className="portrait:hidden">{badge.text}</span>
                <span className="hidden portrait:block">
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
          <div className="flex gap-2">
            {(isNew || isDirty) && (
              <Button
                variant="cancel"
                onClick={onCancel}
                className="flex items-center gap-2"
                disabled={isSaving}
                type="button"
              >
                <X className="h-4 w-4 portrait:block hidden" />
                <span className="portrait:hidden">Cancel</span>
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
                  <span className="portrait:hidden">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="portrait:hidden">Save Changes</span>
                </>
              )}
            </Button>
            {onDelete && !isNew && (
              <Button
                variant="error"
                size="icon"
                onClick={onDelete}
                disabled={isSaving}
                className="transition-opacity hidden sm:flex"
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {onDelete && !isNew && (
          <div className="flex justify-end sm:hidden">
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
          </div>
        )}
      </CardTitle>
    </CardHeader>
  );
};

export default EditableCardHeader;