/**
 * SignX - Camera Stream Manager
 * Manages video stream acquisition, device enumeration, mirroring, and lifecycle.
 */

import { logger } from '../utils/logger.js';

export class CameraManager {
  constructor(videoElement, canvasElement = null) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.stream = null;
    this.videoObjectUrl = null;
    this.isActive = false;
    this.mode = 'camera'; // 'camera' | 'video'
    this.selectedDeviceId = null;
    this.isMirrored = true;
    this.animationFrameId = null;
    this.listeners = new Map();
  }

  /**
   * Enumerate available video input devices
   */
  async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        logger.warn('enumerateDevices not supported in this browser context.');
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (err) {
      logger.error('Failed to list video devices:', err);
      return [];
    }
  }

  /**
   * Start webcam video stream
   */
  async start(deviceId = null) {
    if (this.isActive) {
      this.stop();
    }

    this.mode = 'camera';
    this.selectedDeviceId = deviceId;
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      },
      audio: false
    };

    if (deviceId && deviceId !== 'default') {
      constraints.video.deviceId = { exact: deviceId };
    }

    try {
      logger.info('Requesting camera stream with constraints:', constraints);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        logger.warn('Initial constraints failed, retrying with basic { video: true }...', firstErr);
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      
      if (this.video) {
        this.video.srcObject = this.stream;
        this.video.removeAttribute('src');
        this.video.setAttribute('playsinline', 'true');
        this.video.muted = true;
        this.video.loop = true;
        
        await this.video.play();
        this.setMirror(this.isMirrored);
      }

      this.isActive = true;
      this.emit('started', { mode: 'camera', stream: this.stream, deviceId: this.selectedDeviceId });
      logger.info('Camera stream active.');
      return { success: true, mode: 'camera', stream: this.stream };
    } catch (err) {
      logger.error('Camera access error:', err);
      this.isActive = false;
      this.emit('error', { error: err });
      return { 
        success: false, 
        error: err.name === 'NotAllowedError' 
          ? 'Camera permission denied. Please allow camera access in browser address bar.' 
          : (err.message || 'Unable to access camera device')
      };
    }
  }

  /**
   * Load and play a sign video file (MP4, WebM)
   */
  async loadVideoFile(file) {
    if (!file) return { success: false, error: 'No video file provided' };
    if (this.isActive) {
      this.stop();
    }

    try {
      this.mode = 'video';
      this.videoObjectUrl = URL.createObjectURL(file);
      
      if (this.video) {
        this.video.srcObject = null;
        this.video.src = this.videoObjectUrl;
        this.video.setAttribute('playsinline', 'true');
        this.video.muted = true;
        this.video.loop = true;
        
        await this.video.play();
        this.setMirror(false); // Video file should not be mirrored by default
      }

      this.isActive = true;
      this.emit('started', { mode: 'video', filename: file.name, isVideoFile: true });
      logger.info(`Playing sign video file: ${file.name}`);
      return { success: true, mode: 'video', filename: file.name };
    } catch (err) {
      logger.error('Failed to load video file:', err);
      this.isActive = false;
      this.emit('error', { error: err });
      return { success: false, error: err.message };
    }
  }

  /**
   * Load and play a sign video URL
   */
  async loadVideoUrl(url, label = 'Sign Video') {
    if (!url) return { success: false, error: 'No video URL provided' };
    if (this.isActive) {
      this.stop();
    }

    try {
      this.mode = 'video';
      if (this.video) {
        this.video.srcObject = null;
        this.video.src = url;
        this.video.setAttribute('playsinline', 'true');
        this.video.muted = true;
        this.video.loop = true;
        
        await this.video.play();
        this.setMirror(false);
      }

      this.isActive = true;
      this.emit('started', { mode: 'video', label, isVideoFile: true });
      logger.info(`Playing sign video URL: ${url}`);
      return { success: true, mode: 'video', label };
    } catch (err) {
      logger.error('Failed to load video URL:', err);
      this.isActive = false;
      this.emit('error', { error: err });
      return { success: false, error: err.message };
    }
  }

  /**
   * Stop video stream or video playback
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
      });
      this.stream = null;
    }

    if (this.videoObjectUrl) {
      URL.revokeObjectURL(this.videoObjectUrl);
      this.videoObjectUrl = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.removeAttribute('src');
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.isActive = false;
    this.emit('stopped');
    logger.info('Camera/Video stream stopped.');
  }

  /**
   * Toggle video mirroring
   */
  setMirror(mirror = true) {
    this.isMirrored = mirror;
    if (this.video) {
      this.video.style.transform = mirror ? 'scaleX(-1)' : 'scaleX(1)';
    }
    if (this.canvas) {
      this.canvas.style.transform = mirror ? 'scaleX(-1)' : 'scaleX(1)';
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event).filter(fn => fn !== callback);
    this.listeners.set(event, list);
  }

  emit(event, data) {
    const list = this.listeners.get(event) || [];
    list.forEach(fn => fn(data));
  }
}
