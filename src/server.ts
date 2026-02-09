/**
 * Moleculer Broker Entry Point
 * Starts the TTS microservice broker
 */

import { ServiceBroker } from 'moleculer';
import TTSService from './services/tts.service.js';
import ApiService from './services/api.service.js';

// Create broker configuration
const brokerConfig = {
    namespace: process.env.NAMESPACE || 'supertonic',
    nodeID: process.env.NODE_ID || `tts-node-${process.pid}`,
    
    // Transport configuration (for distributed services)
    transporter: process.env.TRANSPORTER || null, // null for local, "nats://localhost:4222" for distributed
    
    // Logger configuration
    logger: {
        type: 'Console',
        options: {
            level: process.env.LOG_LEVEL || 'info',
            colors: true,
            moduleColors: true,
            formatter: 'full',
        },
    },
    
    // Request timeout
    requestTimeout: 5 * 60 * 1000, // 5 minutes (TTS can take time)
    
    // Retry policy
    retryPolicy: {
        enabled: true,
        retries: 3,
        delay: 1000,
        maxDelay: 5000,
        factor: 2,
    },
    
    // Circuit breaker
    circuitBreaker: {
        enabled: true,
        threshold: 0.5,
        windowTime: 60,
        minRequestCount: 3,
        halfOpenTime: 10 * 1000,
    },
    
    // Internal services
    internalServices: true,
    
    // Hot reload (useful for development)
    hotReload: process.env.NODE_ENV === 'development',
};

// Create the broker
const broker = new ServiceBroker(brokerConfig);

// Load the TTS service
broker.createService(TTSService);

// Load the API Gateway service
broker.createService(ApiService);

// Start the broker
broker.start()
    .then(() => {
        broker.logger.info('='.repeat(60));
        broker.logger.info('Supertonic TTS Microservice Started');
        broker.logger.info('='.repeat(60));
        broker.logger.info(`Node ID: ${broker.nodeID}`);
        broker.logger.info(`Namespace: ${broker.namespace}`);
        broker.logger.info('');
        broker.logger.info('Available Actions:');
        broker.logger.info('  - tts.synthesize        : Synthesize text to speech');
        broker.logger.info('  - tts.synthesizeMixed   : Synthesize mixed-language text');
        broker.logger.info('  - tts.getVoices         : Get available voices');
        broker.logger.info('  - tts.health            : Health check');
        broker.logger.info('');
        broker.logger.info('REST API Endpoints:');
        broker.logger.info('  - POST /tts/synthesize');
        broker.logger.info('  - POST /tts/synthesize-mixed');
        broker.logger.info('  - GET  /tts/voices');
        broker.logger.info('  - GET  /tts/health');
        broker.logger.info('='.repeat(60));
    })
    .catch((err) => {
        broker.logger.error('Failed to start broker:', err);
        process.exit(1);
    });

// Handle graceful shutdown
process.on('SIGINT', async () => {
    broker.logger.info('Received SIGINT, shutting down gracefully...');
    try {
        await broker.stop();
        broker.logger.info('Broker stopped successfully');
        process.exit(0);
    } catch (err) {
        broker.logger.error('Error during shutdown:', err);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    broker.logger.info('Received SIGTERM, shutting down gracefully...');
    try {
        await broker.stop();
        broker.logger.info('Broker stopped successfully');
        process.exit(0);
    } catch (err) {
        broker.logger.error('Error during shutdown:', err);
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    broker.logger.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    broker.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default broker;
