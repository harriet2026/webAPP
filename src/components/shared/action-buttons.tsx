import { Button } from '@/components/ui/button';
import { Edit, Trash2, Eye } from 'lucide-react';

interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onView?: () => void;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
}

export function ActionButtons({ onEdit, onDelete, onView, editDisabled, deleteDisabled }: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-1">
      {onView && (
        <Button variant="ghost" size="icon" onClick={onView}>
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {onEdit && (
        <Button variant="ghost" size="icon" onClick={onEdit} disabled={editDisabled}>
          <Edit className="h-4 w-4" />
        </Button>
      )}
      {onDelete && (
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={deleteDisabled} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
