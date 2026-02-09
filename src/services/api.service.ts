/**
 * Moleculer API Gateway Service
 * Exposes TTS service via HTTP REST API using moleculer-web
 */

import { Service, ServiceBroker } from 'moleculer';
import ApiGateway from 'moleculer-web';

/**
 * API Gateway Service
 * Routes HTTP requests to TTS service actions
 */
export default class ApiService extends Service {
    constructor(broker: ServiceBroker) {
        super(broker);

        this.parseServiceSchema({
            name: 'api',
            
            mixins: [ApiGateway],

            settings: {
                // Server settings
                port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
                host: process.env.HOST || '0.0.0.0',
                
                // CORS settings
                cors: {
                    origin: '*',
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization'],
                    credentials: true,
                },

                // Body parser settings
                bodyParser: {
                    json: {
                        strict: false,
                        limit: '50MB',
                    },
                    urlencoded: {
                        extended: true,
                        limit: '50MB',
                    },
                },

                // Routes
                routes: [
                    {
                        path: '/api',
                        
                        // Map REST routes to service actions
                        aliases: {
                            // TTS Synthesis
                            'POST /tts/synthesize': 'tts.synthesize',
                            'POST /tts/synthesize-mixed': 'tts.synthesizeMixed',
                            
                            // Voice management
                            'GET /tts/voices': 'tts.getVoices',
                            
                            // Health check
                            'GET /tts/health': 'tts.health',
                            'GET /health': 'tts.health',
                        },

                        // Disable authentication for simplicity
                        authentication: false,
                        authorization: false,

                        // Auto-alias for RESTful routes
                        autoAliases: false,

                        // Body parsing
                        bodyParsers: {
                            json: true,
                            urlencoded: { extended: true },
                        },

                        // Mapping policy
                        mappingPolicy: 'restrict',

                        // Enable parameter transformation
                        onBeforeCall(ctx: any, route: any, req: any, res: any) {
                            ctx.meta.headers = req.headers;
                        },

                        // Error handling
                        onError(req: any, res: any, err: any) {
                            res.setHeader('Content-Type', 'application/json');
                            
                            const statusCode = err.code || 500;
                            const errorResponse = {
                                success: false,
                                error: {
                                    code: statusCode,
                                    message: err.message || 'Internal Server Error',
                                    type: err.type || 'SERVER_ERROR',
                                },
                            };

                            res.writeHead(statusCode);
                            res.end(JSON.stringify(errorResponse));
                        },
                    },
                ],

                // Serve static assets (optional)
                assets: {
                    folder: './public',
                },

                // Logging
                logRequestParams: 'debug',
                logResponseData: 'debug',
            },

            // Service lifecycle hooks
            created() {
                this.logger.info('API Gateway service created');
            },

            started() {
                this.logger.info('='.repeat(60));
                this.logger.info('API Gateway started');
                this.logger.info(`Server listening on http://${this.settings.host}:${this.settings.port}`);
                this.logger.info('='.repeat(60));
                this.logger.info('');
                this.logger.info('Available REST API Endpoints:');
                this.logger.info(`  POST http://localhost:${this.settings.port}/api/tts/synthesize`);
                this.logger.info(`  POST http://localhost:${this.settings.port}/api/tts/synthesize-mixed`);
                this.logger.info(`  GET  http://localhost:${this.settings.port}/api/tts/voices`);
                this.logger.info(`  GET  http://localhost:${this.settings.port}/api/tts/health`);
                this.logger.info(`  GET  http://localhost:${this.settings.port}/api/health`);
                this.logger.info('='.repeat(60));
            },

            stopped() {
                this.logger.info('API Gateway stopped');
            },
        });
    }
}
