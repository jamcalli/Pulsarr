import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardHeader, CardTitle } from '@/components/ui/card';
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
      <CardTitle className="flex justify-between items-center text-text">
        <div className="group/name inline-flex items-center gap-2 w-1/2">
          {isEditing ? (
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              autoFocus
              className="w-full"
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
            <div className="flex items-center gap-2">
              <span>{title || 'Unnamed'}</span>
              {!isSaving && (
                <Button
                  variant="noShadow"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover/name:opacity-100 transition-opacity"
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
          {badge && (
            <span className={badge.className || "text-sm bg-primary/10 text-primary px-2 py-1 rounded"}>
              {badge.text}
            </span>
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
              className="transition-opacity"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardTitle>
    </CardHeader>
  );
};

export default EditableCardHeader;