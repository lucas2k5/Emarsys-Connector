/**
 * Endpoint específico para Inngest no Vercel
 * Este arquivo expõe as funções Inngest como serverless functions
 */

const { serve } = require('inngest/express');
const { inngest, syncVTEXProducts, syncVTEXOrders, syncComplete } = require('../lib/inngest');

// Middleware do Inngest
const handler = serve({
  client: inngest,
  functions: [syncVTEXProducts, syncVTEXOrders, syncComplete]
});

module.exports = handler;