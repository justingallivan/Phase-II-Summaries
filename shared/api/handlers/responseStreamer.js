/**
 * Response streaming utilities for real-time progress updates
 * Handles Server-Sent Events (SSE) for progress tracking
 */

export class ResponseStreamer {
  constructor(res) {
    this.res = res;
    this.isStreaming = false;
  }

  /**
   * Initialize streaming response
   */
  initStream() {
    if (this.isStreaming) return;
    
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('Transfer-Encoding', 'chunked');

    this.isStreaming = true;
  }

  /**
   * Send progress update
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Status message
   * @param {Object} data - Additional data to send
   */
  sendProgress(progress, message, data = {}) {
    this.initStream();
    
    const payload = {
      progress: Math.min(100, Math.max(0, progress)),
      message,
      timestamp: new Date().toISOString(),
      ...data
    };

    this.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  /**
   * Send final results
   * @param {Object} results - Final results object
   */
  sendResults(results) {
    this.sendProgress(100, 'Complete!', { results });
  }

  /**
   * Send error
   * @param {string} error - Error message
   */
  sendError(error) {
    const payload = {
      error: error,
      timestamp: new Date().toISOString()
    };
    
    this.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  /**
   * End the stream
   */
  end() {
    if (this.isStreaming) {
      this.res.end();
      this.isStreaming = false;
    }
  }

  /**
   * Create a progress tracker for multi-step operations
   * @param {Array} steps - Array of step descriptions
   * @returns {Object} - Progress tracker object
   */
  createProgressTracker(steps) {
    const tracker = {
      totalSteps: steps.length,
      currentStep: 0,
      steps: steps,
      
      nextStep: () => {
        if (tracker.currentStep < tracker.totalSteps) {
          tracker.currentStep++;
          const progress = Math.round((tracker.currentStep / tracker.totalSteps) * 100);
          const message = steps[tracker.currentStep - 1];
          this.sendProgress(progress, message);
        }
      },
      
      updateStep: (message, additionalData = {}) => {
        const progress = Math.round((tracker.currentStep / tracker.totalSteps) * 100);
        this.sendProgress(progress, message, additionalData);
      },
      
      complete: (results) => {
        tracker.currentStep = tracker.totalSteps;
        this.sendResults(results);
      },
      
      error: (error) => {
        this.sendError(error);
      }
    };
    
    return tracker;
  }
}

/**
 * Factory function to create a response streamer
 * @param {Object} res - Express/Next.js response object
 * @returns {ResponseStreamer} - Response streamer instance
 */
export function createResponseStreamer(res) {
  return new ResponseStreamer(res);
}

/**
 * Utility function for non-streaming JSON responses
 * @param {Object} res - Response object
 * @param {number} status - HTTP status code
 * @param {Object} data - Response data
 */
export function sendJSONResponse(res, status, data) {
  res.status(status).json(data);
}

/**
 * Utility function for error responses
 * @param {Object} res - Response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 */
export function sendErrorResponse(res, status, message) {
  res.status(status).json({
    error: message,
    timestamp: new Date().toISOString()
  });
}