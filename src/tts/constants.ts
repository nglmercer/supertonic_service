import type { Language } from './types.js';

/**
 * Base URL for HuggingFace Supertonic voice embeddings
 */
export const BASE_URL = 'https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/';

/**
 * Supported languages array
 */
export const SUPPORTED_LANGUAGES: Language[] = ["en", "ko", "es", "pt", "fr"];

// ============================================================================
// API Constants
// ============================================================================

/**
 * API Endpoints
 */
export const API_ENDPOINTS = {
  SYNTHESIZE: '/api/tts/synthesize',
  SYNTHESIZE_MIXED: '/api/tts/synthesize-mixed',
  VOICES: '/api/tts/voices',
  HEALTH: '/api/tts/health',
  HEALTH_ALT: '/api/health',
  HEALTH_ROOT: '/health',
} as const;

/**
 * HTTP Methods
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  OPTIONS: 'OPTIONS',
} as const;

// ============================================================================
// TTS Method Names
// ============================================================================

/**
 * TTS Service Methods
 */
export const TTS_METHODS = {
  SYNTHESIZE: 'synthesize',
  SYNTHESIZE_MIXED: 'synthesizeMixed',
  GET_VOICES: 'getVoices',
  HEALTH: 'health',
} as const;

/**
 * Type for TTS method names
 */
export type TTSMethodName = typeof TTS_METHODS[keyof typeof TTS_METHODS];

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Environment Variable Names
 */
export const ENV_VARS = {
  // Server
  PORT: 'PORT',
  HOST: 'HOST',
  NODE_ENV: 'NODE_ENV',
  BUN_ENV: 'BUN_ENV',
  
  // TTS Service
  TTS_OUTPUT_DIR: 'TTS_OUTPUT_DIR',
  TTS_DEFAULT_VOICE: 'TTS_DEFAULT_VOICE',
  
  // Libp2p
  LIBP2P_PORT: 'LIBP2P_PORT',
  LIBP2P_MODE: 'LIBP2P_MODE',
  LIBP2P_SERVER: 'LIBP2P_SERVER',
  
  // Client
  SERVER_URL: 'SERVER_URL',
  OUTPUT_DIR: 'OUTPUT_DIR',
} as const;

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULTS = {
  // Server
  PORT: 3001,
  HOST: '0.0.0.0',
  
  // Libp2p
  LIBP2P_PORT: 9001,
  
  // TTS
  DEFAULT_VOICE: 'F1',
  DEFAULT_OUTPUT_DIR: './output',
  DEFAULT_SILENCE_DURATION: 0.3,
  DEFAULT_SILENCE_DURATION_MIXED: 0.5,
  
  // Client
  DEFAULT_SERVER_URL: 'http://localhost:3001',
  DEFAULT_CLIENT_OUTPUT_DIR: './output',
  
  // Discovery
  DISCOVERY_TIMEOUT: 15000,
  MDNS_DISCOVERY_INTERVAL: 1000,
} as const;

// ============================================================================
// Protocol Constants
// ============================================================================

/**
 * Libp2p Protocol
 */
export const PROTOCOLS = {
  TTS: '/tts/1.0.0',
} as const;

// ============================================================================
// Response Status
// ============================================================================

/**
 * Health Status values
 */
export const HEALTH_STATUS = {
  OK: 'ok',
  ERROR: 'error',
} as const;

/**
 * Libp2p Status values
 */
export const LIBP2P_STATUS = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
} as const;

// ============================================================================
// Error Messages
// ============================================================================

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  // Validation
  MISSING_TEXT: 'Missing required parameter: text',
  MISSING_TAGGED_TEXT: 'Missing required parameter: taggedText',
  INVALID_REQUEST: 'Invalid request',
  UNKNOWN_ERROR: 'Unknown error',
  INTERNAL_SERVER_ERROR: 'Internal Server Error',
  
  // Discovery
  DISCOVERY_TIMEOUT: 'mDNS discovery timeout after 15s',
  
  // Network
  NO_RESPONSE: 'No response from server',
} as const;

// ============================================================================
// Content Types
// ============================================================================

/**
 * HTTP Content Types
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
} as const;

// ============================================================================
// CORS Headers
// ============================================================================

/**
 * CORS Headers
 */
export const CORS_HEADERS = {
  ALLOW_ORIGIN: '*',
  ALLOW_METHODS: 'GET, POST, OPTIONS',
  ALLOW_HEADERS: 'Content-Type',
} as const;
