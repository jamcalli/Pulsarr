import { Loader2, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEdit } from '@/components/ui/inline-edit';
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
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <CardHeader>
      <CardTitle className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-foreground">
          <div className="group/name inline-flex items-center gap-2 flex-1 min-w-0">
            {badge && (
              <Badge className={badge.className || "text-sm bg-blue"}>
                <span className={isMobile ? "hidden" : "block"}>{badge.text}</span>
                <span className={isMobile ? "block" : "hidden"}>
                  {badge.text === "Default" ? "D" : badge.text}
                </span>
              </Badge>
            )}
            <InlineEdit
              value={title}
              onCommit={onTitleChange}
              disabled={isSaving}
            />
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
              variant="bluenoShadow"
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
              variant="bluenoShadow"
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