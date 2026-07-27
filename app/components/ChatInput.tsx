'use client';

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import imageCompression from 'browser-image-compression';

interface ChatInputProps {
  onSend: (message: string, imageUrls?: string[] | null) => void;
  isLoading: boolean;
  onImageUpload?: (file: File) => Promise<string | null>;
  onStop?: () => void;
  placeholder?: string;
  editValue?: string;
  editImageUrls?: string[];
  onCancelEdit?: () => void;
}

function SendButton({ disabled, isLoading, onStop }: { disabled: boolean; isLoading: boolean; onStop?: () => void }) {
  if (isLoading) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center animate-morphIn hover:bg-blue-600 active:scale-95 transition-all duration-150"
        title="Leállítás"
      >
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex-shrink-0 w-10 h-10 bg-blue-500 disabled:bg-gray-300 rounded-full flex items-center justify-center btn-send group hover:bg-blue-600 active:scale-95 transition-all duration-150"
    >
      <svg className="w-5 h-5 text-white transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.75 9.75a2.25 2.25 0 013.182-3.182L12 12l5.068-5.432a2.25 2.25 0 113.182 3.182L18 12l2.25 2.25a2.25 2.25 0 01-3.182 3.182L12 12l-5.068 5.432a2.25 2.25 0 01-3.182-3.182L6 12z" />
      </svg>
    </button>
  );
}

export default function ChatInput({
  onSend, isLoading, onImageUpload, onStop,
  placeholder = 'Írj bármit...',
  editValue, editImageUrls, onCancelEdit,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingEditUrls, setExistingEditUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (editValue !== undefined) {
      setInput(editValue);
      textareaRef.current?.focus();
    }
  }, [editValue]);

  useEffect(() => {
    if (editImageUrls && editImageUrls.length > 0) {
      setExistingEditUrls(editImageUrls);
      setImagePreviews(editImageUrls);
    } else if (editImageUrls && editImageUrls.length === 0) {
      setExistingEditUrls([]);
      setImagePreviews([]);
    }
  }, [editImageUrls]);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const processFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      showToast('Csak képeket lehet feltölteni!');
      return;
    }

    const oversized = imageFiles.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      showToast(`${oversized.length} kép túl nagy (max 10MB)!`);
      return;
    }

    try {
      const compressedFiles: File[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        setUploadProgress(Math.round((i / imageFiles.length) * 100));
        const compressed = await imageCompression(file, {
          maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true,
        });
        compressedFiles.push(compressed);
      }
      setUploadProgress(100);

      setSelectedImages(prev => [...prev, ...compressedFiles]);
      setImagePreviews(prev => [...prev, ...compressedFiles.map(f => URL.createObjectURL(f))]);
    } catch (error) {
      console.error('Error compressing images:', error);
      showToast('Hiba a kép tömörítésekor');
    } finally {
      setUploadProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedImages.length === 0 && existingEditUrls.length === 0) || isLoading || isUploading) return;

    let allImageUrls: string[] = [...existingEditUrls];

    if (selectedImages.length > 0 && onImageUpload) {
      setIsUploading(true);
      const urls: (string | null)[] = [];
      for (let i = 0; i < selectedImages.length; i++) {
        setUploadProgress(Math.round(((i + 1) / selectedImages.length) * 100));
        const url = await onImageUpload(selectedImages[i]);
        urls.push(url);
      }
      const uploadedUrls = urls.filter((url): url is string => url !== null);
      if (uploadedUrls.length === 0 && allImageUrls.length === 0) {
        showToast('Nem sikerült feltölteni a képeket');
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }
      allImageUrls = [...allImageUrls, ...uploadedUrls];
      setIsUploading(false);
      setUploadProgress(0);
    }

    onSend(input.trim(), allImageUrls.length > 0 ? allImageUrls : null);
    setInput('');
    setSelectedImages([]);
    setExistingEditUrls([]);
    setImagePreviews(prev => { prev.forEach((u, i) => { if (i >= existingEditUrls.length) URL.revokeObjectURL(u); }); return []; });
    onCancelEdit?.();
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
    await processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (isLoading || isUploading) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await processFiles(files);
  };

  const removeImage = (index: number) => {
    if (index < existingEditUrls.length) {
      setExistingEditUrls(prev => prev.filter((_, i) => i !== index));
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      const fileIdx = index - existingEditUrls.length;
      setSelectedImages(prev => prev.filter((_, i) => i !== fileIdx));
      setImagePreviews(prev => {
        URL.revokeObjectURL(prev[index]);
        return prev.filter((_, i) => i !== index);
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl mx-auto relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-20 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-[28px] flex items-center justify-center pointer-events-none animate-fadeIn">
          <div className="text-blue-500 font-medium text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Képek elhelyezése...
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`absolute -top-12 left-0 right-0 z-30 px-4 py-2.5 rounded-xl text-sm font-medium animate-slideDown flex items-center gap-2 ${
            toast.type === 'error'
              ? 'text-red-700'
              : 'text-green-700'
          }`}
          style={{ background: toast.type === 'error' ? 'rgba(254,202,202,0.95)' : 'rgba(187,247,208,0.95)' }}
        >
          {toast.type === 'error' ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {toast.message}
        </div>
      )}

      <div className="relative rounded-[28px] shadow-lg transition-shadow duration-200 focus-within:shadow-xl" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
        {/* Upload progress bar */}
        {isUploading && uploadProgress > 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-[28px] overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-t-[28px]"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {imagePreviews.length > 0 && (
          <div className="p-3 pb-0">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative inline-block flex-shrink-0 animate-scaleIn">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="h-20 w-auto rounded-lg object-cover" style={{ border: '1px solid var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-all hover:scale-110 active:scale-90"
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
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full disabled:opacity-50 transition-all duration-150 hover-scale touch-active"
            title="Kép feltöltése"
            style={{ color: 'var(--fg-muted)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="w-full bg-transparent border-none outline-none resize-none py-2.5 px-1 max-h-[120px] min-h-[44px] text-[16px] leading-relaxed transition-opacity duration-200 disabled:opacity-50"
              style={{ color: 'var(--fg)' }}
            />
          </div>

          {existingEditUrls.length > 0 || editValue !== undefined ? (
            <button
              type="button"
              onClick={() => { setInput(''); setExistingEditUrls([]); setImagePreviews([]); onCancelEdit?.(); }}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 hover-scale"
              title="Mégse"
              style={{ color: 'var(--fg-muted)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
          <SendButton
            disabled={(!input.trim() && selectedImages.length === 0 && existingEditUrls.length === 0) || isLoading || isUploading}
            isLoading={isLoading || isUploading}
            onStop={onStop}
          />
        </div>
      </div>
    </form>
  );
}
