import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CloudStoragePicker } from "@/components/CloudStoragePicker";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onDriveSelect: (fileId: string, fileName: string) => void;
  accept?: string;
  maxSize?: number;
}

export function FileUpload({
  onFileSelect,
  onDriveSelect,
  accept = "*",
  maxSize = 50 * 1024 * 1024
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isCloudPickerOpen, setIsCloudPickerOpen] = useState(false);
  const { toast } = useToast();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    if (maxSize && file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${Math.round(maxSize / 1024 / 1024)}MB`,
        variant: "destructive",
      });
      return;
    }

    onFileSelect(file);
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-gray-700 hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = accept;
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFileSelection(file);
          };
          input.click();
        }}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <div className="text-sm text-gray-400">
          <span className="font-medium">Click to upload</span> or drag and drop
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Maximum file size: {Math.round(maxSize / 1024 / 1024)}MB
        </p>
      </div>

      <div className="flex items-center justify-center gap-4">
        <div className="relative flex-1 h-px bg-gray-700">
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-background px-2 text-xs text-gray-400">
            or
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full flex items-center gap-2"
        onClick={() => setIsCloudPickerOpen(true)}
      >
        <Cloud className="h-4 w-4" />
        Select from Google Drive
      </Button>

      <CloudStoragePicker
        open={isCloudPickerOpen}
        onOpenChange={setIsCloudPickerOpen}
        onFileSelect={onDriveSelect}
      />
    </div>
  );
}