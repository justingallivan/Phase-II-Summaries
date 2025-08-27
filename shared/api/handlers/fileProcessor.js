/**
 * Shared file processing utilities for document analysis apps
 * Handles PDF extraction, validation, and text processing
 */

import pdf from 'pdf-parse';

export class FileProcessor {
  constructor(config = {}) {
    this.config = {
      minTextLength: config.minTextLength || 100,
      maxTextLength: config.maxTextLength || 1000000,
      supportedFormats: config.supportedFormats || ['pdf'],
      ...config
    };
  }

  /**
   * Process a single file buffer
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Original filename
   * @returns {Promise<Object>} - Processed file data
   */
  async processFile(buffer, filename) {
    const fileType = this.getFileType(filename);
    
    if (!this.isSupportedFormat(fileType)) {
      throw new Error(`Unsupported file format: ${fileType}`);
    }

    switch (fileType) {
      case 'pdf':
        return await this.processPDF(buffer, filename);
      case 'txt':
        return await this.processText(buffer, filename);
      case 'docx':
        // Future: Add DOCX support
        throw new Error('DOCX support not yet implemented');
      default:
        throw new Error(`Unknown file type: ${fileType}`);
    }
  }

  /**
   * Process PDF file
   * @param {Buffer} buffer - PDF buffer
   * @param {string} filename - Original filename
   * @returns {Promise<Object>} - Extracted data
   */
  async processPDF(buffer, filename) {
    try {
      const pdfData = await pdf(buffer);
      const text = pdfData.text;

      if (!text || text.trim().length < this.config.minTextLength) {
        throw new Error('PDF appears to be empty or contains insufficient text');
      }

      if (text.length > this.config.maxTextLength) {
        console.warn(`Text exceeds maximum length, truncating from ${text.length} to ${this.config.maxTextLength}`);
      }

      return {
        filename,
        text: text.substring(0, this.config.maxTextLength),
        metadata: {
          pages: pdfData.numpages,
          info: pdfData.info,
          wordCount: text.split(/\s+/).length,
          characterCount: text.length,
          truncated: text.length > this.config.maxTextLength
        }
      };
    } catch (error) {
      throw new Error(`Failed to process PDF: ${error.message}`);
    }
  }

  /**
   * Process plain text file
   * @param {Buffer} buffer - Text buffer
   * @param {string} filename - Original filename
   * @returns {Promise<Object>} - Extracted data
   */
  async processText(buffer, filename) {
    const text = buffer.toString('utf-8');
    
    if (text.trim().length < this.config.minTextLength) {
      throw new Error('Text file appears to be empty or contains insufficient text');
    }

    return {
      filename,
      text: text.substring(0, this.config.maxTextLength),
      metadata: {
        wordCount: text.split(/\s+/).length,
        characterCount: text.length,
        truncated: text.length > this.config.maxTextLength
      }
    };
  }

  /**
   * Get file type from filename
   * @param {string} filename - Filename
   * @returns {string} - File type
   */
  getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    return extension;
  }

  /**
   * Check if format is supported
   * @param {string} format - File format
   * @returns {boolean} - Whether format is supported
   */
  isSupportedFormat(format) {
    return this.config.supportedFormats.includes(format);
  }

  /**
   * Process multiple files
   * @param {Array} files - Array of file objects with buffer and name
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} - Array of processed file data
   */
  async processMultipleFiles(files, onProgress = null) {
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (onProgress) {
        const progress = Math.round((i / files.length) * 100);
        onProgress({
          current: i + 1,
          total: files.length,
          progress,
          filename: file.name || file.originalname
        });
      }

      try {
        const processedData = await this.processFile(
          file.buffer,
          file.name || file.originalname
        );
        results.push({
          success: true,
          data: processedData
        });
      } catch (error) {
        results.push({
          success: false,
          filename: file.name || file.originalname,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Extract text chunks for processing
   * @param {string} text - Full text
   * @param {number} chunkSize - Size of each chunk
   * @param {number} overlap - Overlap between chunks
   * @returns {Array<string>} - Array of text chunks
   */
  createTextChunks(text, chunkSize = 10000, overlap = 500) {
    const chunks = [];
    let position = 0;

    while (position < text.length) {
      const chunk = text.substring(position, position + chunkSize);
      chunks.push(chunk);
      position += chunkSize - overlap;
    }

    return chunks;
  }
}

/**
 * Factory function to create a file processor
 * @param {Object} config - Configuration options
 * @returns {FileProcessor} - File processor instance
 */
export function createFileProcessor(config = {}) {
  return new FileProcessor(config);
}