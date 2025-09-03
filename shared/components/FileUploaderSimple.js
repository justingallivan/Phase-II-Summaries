import { useState } from 'react';
import styles from './FileUploader.module.css';

export default function FileUploaderSimple({ 
  onFilesSelected, 
  multiple = true, 
  accept = '.pdf',
  maxSize = 50 * 1024 * 1024,
  hideFileList = false,
}) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateAndSetFiles = (selectedFiles) => {
    const validFiles = selectedFiles.filter(file => {
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        return false;
      }
      return true;
    });

    setFiles(validFiles);
    if (validFiles.length > 0) {
      setError(null);
      // Immediately pass files to parent component
      onFilesSelected(validFiles);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    validateAndSetFiles(selectedFiles);
  };

  const removeFile = (fileName) => {
    const updatedFiles = files.filter(f => f.name !== fileName);
    setFiles(updatedFiles);
    onFilesSelected(updatedFiles);
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

    setFiles(validFiles);
    if (validFiles.length > 0) {
      if (multiple || validFiles.length === 1) {
        setError(null);  // Only clear error if it wasn't the multiple files warning
      }
      onFilesSelected(validFiles);
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
            {isDragging 
              ? 'Drop file here...'
              : files.length > 0 
                ? `${files[0].name} selected`
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

      {files.length > 0 && !hideFileList && (
        <div className={styles.fileList}>
          {files.map((file) => (
            <div key={file.name} className={styles.fileItem}>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
              </div>
              <button
                onClick={() => removeFile(file.name)}
                className={styles.removeButton}
                aria-label="Remove file"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}