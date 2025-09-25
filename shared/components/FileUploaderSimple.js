import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import styles from './FileUploader.module.css';

export default function FileUploaderSimple({ 
  onFilesUploaded, // Changed from onFilesSelected to onFilesUploaded
  multiple = true, 
  accept = '.pdf',
  maxSize = 50 * 1024 * 1024, // Full 50MB limit with blob storage
  hideFileList = false,
}) {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadFilesToBlob = async (selectedFiles) => {
    const validFiles = selectedFiles.filter(file => {
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setFiles(validFiles);
    setError(null);
    setIsUploading(true);
    
    const uploadedBlobs = [];
    
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        console.log(`Starting blob upload for: ${file.name}`);
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/upload-handler',
          onProgress: (progress) => {
            console.log(`Upload progress for ${file.name}:`, progress);
            setUploadProgress(prev => ({ 
              ...prev, 
              [file.name]: Math.round(progress.percentage) 
            }));
          }
        });
        console.log(`Blob upload completed:`, blob);
        
        uploadedBlobs.push({
          url: blob.url,
          filename: file.name,
          size: file.size,
          originalFile: file
        });
        
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }
      
      setUploadedFiles(uploadedBlobs);
      onFilesUploaded(uploadedBlobs);
      
    } catch (uploadError) {
      console.error('Upload error:', uploadError);
      setError(`Upload failed: ${uploadError.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);

    // Apply same validation as drag-and-drop
    const validFiles = selectedFiles.filter(file => {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      if (accept && !accept.includes(fileExt)) {
        setError(`File ${file.name} is not an accepted format (${accept})`);
        return false;
      }

      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      uploadFilesToBlob(validFiles);
    }
  };

  const removeFile = (fileName) => {
    const updatedFiles = files.filter(f => f.name !== fileName);
    const updatedUploadedFiles = uploadedFiles.filter(f => f.filename !== fileName);
    setFiles(updatedFiles);
    setUploadedFiles(updatedUploadedFiles);
    onFilesUploaded(updatedUploadedFiles);
    
    // Clear progress for removed file
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    
    const validFiles = droppedFiles.filter(file => {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      if (accept && !accept.includes(fileExt)) {
        setError(`File ${file.name} is not an accepted format (${accept})`);
        return false;
      }
      
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        return false;
      }
      return true;
    });

    if (!multiple && validFiles.length > 1) {
      const warningMsg = `Only one file can be uploaded at a time. Using first file: ${validFiles[0].name}`;
      setError(warningMsg);
      validFiles.splice(1);
      // Clear warning after 3 seconds
      setTimeout(() => setError(null), 3000);
    }

    if (validFiles.length > 0) {
      uploadFilesToBlob(validFiles);
    }
  };

  return (
    <div className={styles.uploaderContainer}>
      <div 
        className={styles.uploadArea}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          className={styles.fileInput}
          id="file-upload-simple"
        />
        <label 
          htmlFor="file-upload-simple" 
          className={`${styles.uploadLabel} ${isDragging ? styles.dragging : ''}`}
        >
          <div className={styles.uploadIcon}>
            {isDragging ? '📥' : '📁'}
          </div>
          <div className={styles.uploadText}>
            {isUploading 
              ? 'Uploading...'
              : isDragging 
                ? 'Drop file here...'
                : uploadedFiles.length > 0 
                  ? `${uploadedFiles.length} file(s) uploaded`
                  : multiple 
                    ? 'Click to select files or drag and drop'
                    : 'Click to select a file or drag and drop'
            }
          </div>
        </label>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          ⚠️ {error}
        </div>
      )}

      {(files.length > 0 || uploadedFiles.length > 0) && !hideFileList && (
        <div className={styles.fileList}>
          {files.map((file) => {
            const progress = uploadProgress[file.name] || 0;
            const isCompleted = uploadedFiles.some(uf => uf.filename === file.name);
            
            return (
              <div key={file.name} className={styles.fileItem}>
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>
                    {file.name} 
                    {isUploading && !isCompleted && (
                      <span className={styles.uploadStatus}> ({progress}%)</span>
                    )}
                    {isCompleted && (
                      <span className={styles.uploadComplete}> ✓</span>
                    )}
                  </span>
                  <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                </div>
                {!isUploading && (
                  <button
                    onClick={() => removeFile(file.name)}
                    className={styles.removeButton}
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}