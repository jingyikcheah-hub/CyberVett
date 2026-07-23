'use strict'

module.exports = function apiUnavailable(_request, response) {
  response.statusCode = 503
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Retry-After', '300')
  response.end(JSON.stringify({
    error: {
      code: 'API_NOT_DEPLOYED',
      message: 'This Vercel project hosts the CyberVett web app only. Configure a same-origin full-stack deployment to use the API.',
    },
  }))
}
