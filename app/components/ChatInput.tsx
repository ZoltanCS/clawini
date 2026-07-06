'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import imageCompression from 'browser-image-compression';

interface ChatInputProps {
  onSend: (message: string, imageUrls?: string[] | null) => void;
  isLoading: boolean;
  onImageUpload?: (file: File) => Promise<string | null>;
  placeholder?: string;
}

export default function ChatInput({ 
  onSend, 
  isLoading, 
  onImageUpload,
  placeholder = "Üzenet írása...",
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedImages.length === 0) || isLoading || isUploading) return;

    let imageUrls: string[] | null = null;

    if (selectedImages.length > 0 && onImageUpload) {
      setIsUploading(true);
      const urls = await Promise.all(
        selectedImages.map(f => onImageUpload!(f))
      );
      imageUrls = urls.filter((url): url is string => url !== null);
      if (imageUrls.length === 0) imageUrls = null;
      setIsUploading(false);
    }

    onSend(input.trim(), imageUrls);
    setInput('');
    setSelectedImages([]);
    setImagePreviews([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('Kérlek, válassz képeket!');
      return;
    }

    const oversized = imageFiles.filter(f => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      alert('Egyes képek mérete meghaladja az 5MB-ot!');
      return;
    }

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };

      const compressedFiles: File[] = [];
      for (const file of imageFiles) {
        const compressed = await imageCompression(file, options);
        compressedFiles.push(compressed);
      }

      setSelectedImages(prev => [...prev, ...compressedFiles]);

      const previewUrls = compressedFiles.map(f => URL.createObjectURL(f));
      setImagePreviews(prev => [...prev, ...previewUrls]);
    } catch (error) {
      console.error('Error compressing images:', error);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative bg-white rounded-[28px] shadow-lg border border-gray-200 flex flex-col">
        {imagePreviews.length > 0 && (
          <div className="p-3 pb-0">
            <div className="flex gap-2 overflow-x-auto">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative inline-block flex-shrink-0">
                  <img 
                    src={preview} 
                    alt={`Preview ${index + 1}`} 
                    className="h-20 w-auto rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 p-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors disabled:opacity-50 touch-active"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isLoading || isUploading}
            className="flex-1 bg-transparent border-none outline-none resize-none py-3 px-1 text-gray-800 placeholder-gray-400 max-h-[120px] min-h-[48px] text-base"
          />

          {(input.trim() || selectedImages.length > 0) && !isUploading ? (
            <button
              type="submit"
              disabled={isLoading}
              className="flex-shrink-0 w-11 h-11 bg-blue-500 active:bg-blue-600 disabled:bg-gray-300 rounded-full flex items-center justify-center transition-colors touch-active"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors touch-active"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
