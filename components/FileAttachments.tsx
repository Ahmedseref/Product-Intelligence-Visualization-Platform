import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, FileText, Image, FileSpreadsheet, File, Download, Trash2, Plus, Loader2 } from 'lucide-react';

export interface Attachment {
  id?: number;
  attachmentId: string;
  supplierProductId: string;
  name: string;
  type: 'image' | 'pdf' | 'excel' | 'word' | 'other';
  mimeType?: string;
  size?: number;
  objectPath: string;
  category?: string;
  uploadedAt?: Date;
}

interface FileAttachmentsProps {
  supplierProductId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  readOnly?: boolean;
}

const FILE_CATEGORIES = ['Technical Documents', 'Certificates', 'Images', 'Other'];

const getFileType = (mimeType: string, fileName: string): 'image' | 'pdf' | 'excel' | 'word' | 'other' => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) return 'excel';
  if (mimeType.includes('word') || mimeType.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return 'word';
  return 'other';
};

const getFileIcon = (type: string) => {
  switch (type) {
    case 'image': return <Image className="w-5 h-5 text-green-500" />;
    case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
    case 'excel': return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    case 'word': return <FileText className="w-5 h-5 text-blue-600" />;
    default: return <File className="w-5 h-5 text-gray-500" />;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const generateAttachmentId = (): string => {
  const num = Math.floor(Math.random() * 10000);
  return `A-${num.toString().padStart(4, '0')}`;
};

export const FileAttachments: React.FC<FileAttachmentsProps> = ({
  supplierProductId,
  attachments,
  onAttachmentsChange,
  readOnly = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Other');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File): Promise<Attachment | null> => {
    try {
      const response = await fetch('/api/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL, objectPath } = await response.json();

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const fileType = getFileType(file.type, file.name);
      const attachmentId = generateAttachmentId();

      const attachment: Attachment = {
        attachmentId,
        supplierProductId,
        name: file.name,
        type: fileType,
        mimeType: file.type,
        size: file.size,
        objectPath,
        category: selectedCategory,
        uploadedAt: new Date(),
      };

      const saveResponse = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attachment),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save attachment metadata');
      }

      const savedAttachment = await saveResponse.json();
      return savedAttachment;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newUploadingFiles = fileArray.map(f => f.name);
    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    const uploadPromises = fileArray.map(async (file) => {
      const attachment = await uploadFile(file);
      setUploadingFiles(prev => prev.filter(name => name !== file.name));
      return attachment;
    });

    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter((a): a is Attachment => a !== null);
    
    if (successfulUploads.length > 0) {
      onAttachmentsChange([...attachments, ...successfulUploads]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (readOnly) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [attachments, readOnly, selectedCategory]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
      onAttachmentsChange(attachments.filter(a => a.attachmentId !== attachmentId));
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleDownload = (attachment: Attachment) => {
    window.open(attachment.objectPath, '_blank');
  };

  const groupedAttachments = attachments.reduce((acc, att) => {
    const category = att.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(att);
    return acc;
  }, {} as Record<string, Attachment[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Product Files
        </h3>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {FILE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Upload Files
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
      />

      {!readOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            isDragging 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-gray-600 mb-1">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-sm text-gray-400">
            Supports images, PDF, Excel, Word documents
          </p>
        </div>
      )}

      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map(fileName => (
            <div key={fileName} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-700">Uploading {fileName}...</span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(groupedAttachments).length > 0 ? (
        <div className="space-y-4">
          {FILE_CATEGORIES.filter(cat => groupedAttachments[cat]?.length > 0).map(category => (
            <div key={category} className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                {category} ({groupedAttachments[category].length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {groupedAttachments[category].map(attachment => (
                  <div
                    key={attachment.attachmentId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(attachment.type)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {attachment.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {attachment.size ? formatFileSize(attachment.size) : 'Unknown size'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(attachment)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {!readOnly && (
                        <button
                          onClick={() => handleDelete(attachment.attachmentId)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !uploadingFiles.length && (
          <div className="text-center py-8 text-gray-400">
            <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No files attached yet</p>
          </div>
        )
      )}
    </div>
  );
};

export default FileAttachments;
