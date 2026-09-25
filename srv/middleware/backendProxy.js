const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function backendProxy(backendUrl, proxyTimeout) {
  const target = new URL(backendUrl);
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('BACKEND_URL must be an HTTP(S) origin, for example http://127.0.0.1:4005');
  }

  return createProxyMiddleware({
    target: target.origin,
    changeOrigin: false,
    pathFilter: pathname =>
      ['/health', '/api/health'].includes(pathname) ||
      ['/auth', '/odata/v4/booking', '/api/v1'].some(
        prefix => pathname === prefix || pathname.startsWith(prefix + '/')
      ),
    cookieDomainRewrite: '',
    proxyTimeout,
    on: {
      error(error, _req, res) {
        console.error('Backend proxy error:', error.code || 'UNKNOWN');
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({ error: { code: 'BACKEND_UNAVAILABLE', message: 'networkError' } })
        );
      }
    }
  });
};
