'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import imageCompression from 'browser-image-compression';

interface ChatInputProps {
  onSend: (message: string, imageUrls?: string[] | null) => void;
  isLoading: boolean;
  onImageUpload?: (file: File) => Promise<string | null>;
  placeholder?: string;
}

function SendButton({ disabled, isLoading }: { disabled: boolean; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex-shrink-0 w-10 h-10 bg-blue-400 rounded-full flex items-center justify-center">
        <svg className="w-5 h-5 text-white spinner" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex-shrink-0 w-10 h-10 bg-blue-500 disabled:bg-gray-300 rounded-full flex items-center justify-center btn-send group"
    >
      <svg className="w-5 h-5 text-white transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.75 9.75a2.25 2.25 0 013.182-3.182L12 12l5.068-5.432a2.25 2.25 0 113.182 3.182L18 12l2.25 2.25a2.25 2.25 0 01-3.182 3.182L12 12l-5.068 5.432a2.25 2.25 0 01-3.182-3.182L6 12z" />
      </svg>
    </button>
  );
}

export default function ChatInput({
  onSend, isLoading, onImageUpload,
  placeholder = 'Írj bármit...',
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
      const urls = await Promise.all(selectedImages.map(f => onImageUpload!(f)));
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
    if (imageFiles.length === 0) { alert('Kérlek, válassz képeket!'); return; }

    const oversized = imageFiles.filter(f => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) { alert('Egyes képek mérete meghaladja az 5MB-ot!'); return; }

    try {
      const compressedFiles: File[] = [];
      for (const file of imageFiles) {
        const compressed = await imageCompression(file, {
          maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true,
        });
        compressedFiles.push(compressed);
      }

      setSelectedImages(prev => [...prev, ...compressedFiles]);
      setImagePreviews(prev => [...prev, ...compressedFiles.map(f => URL.createObjectURL(f))]);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
      <div className="relative bg-white rounded-[28px] shadow-lg border border-gray-200 transition-shadow duration-200 focus-within:shadow-xl focus-within:border-blue-300">
        {imagePreviews.length > 0 && (
          <div className="p-3 pb-0">
            <div className="flex gap-2 overflow-x-auto">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative inline-block flex-shrink-0 animate-scaleIn">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="h-20 w-auto rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors hover-scale"
                  >
                    ×
                  </button>
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white spinner" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-1.5 p-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-100 disabled:opacity-50 transition-all duration-150 hover:bg-gray-50 hover-scale"
            title="Kép feltöltése"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
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

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isLoading || isUploading}
              className="w-full bg-transparent border-none outline-none resize-none py-2.5 px-1 text-gray-800 placeholder-gray-400 max-h-[120px] min-h-[44px] text-[16px] leading-relaxed transition-opacity duration-200 disabled:opacity-50"
            />
          </div>

          <SendButton disabled={(!input.trim() && selectedImages.length === 0) || isLoading || isUploading} isLoading={isLoading || isUploading} />
        </div>
      </div>
    </form>
  );
}
