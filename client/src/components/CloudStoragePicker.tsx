import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileIcon, CloudOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";

interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
}

interface CloudStoragePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect: (fileId: string, fileName: string) => void;
}

export function CloudStoragePicker({ open, onOpenChange, onFileSelect }: CloudStoragePickerProps) {
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const { data: files = [], isLoading, error } = useQuery<CloudFile[]>({
    queryKey: ["/api/google/auth"],
    enabled: open,
  });

  const handleFileSelect = (fileId: string, fileName: string) => {
    setSelectedFileId(fileId);
    onFileSelect(fileId, fileName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[475px]">
        <DialogHeader>
          <DialogTitle>Select a file from Google Drive</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CloudOff className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600">Failed to load files from Google Drive</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-600">No files found in Google Drive</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <Button
                  key={file.id}
                  variant="outline"
                  className={`w-full justify-start gap-3 ${
                    selectedFileId === file.id ? "border-primary" : ""
                  }`}
                  onClick={() => handleFileSelect(file.id, file.name)}
                >
                  <FileIcon className="h-4 w-4 text-gray-400" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-gray-500">
                      {file.size ? `${Math.round(file.size / 1024)} KB` : ""}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
