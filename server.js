import Fastify from 'fastify';
import context from "./context.js";
import { templateEngine } from './middleware/template_engine.js';

async function main() {
    const fastify = Fastify({
        logger: false
    });

    context.mysql = "database connection example - not null";

    templateEngine(fastify, false);

    try {
        await fastify.listen({ port: 3000 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

main();