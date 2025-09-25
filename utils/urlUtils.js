function normalizeVtexBaseUrl(rawBaseUrl) {
  try {
    if (!rawBaseUrl || typeof rawBaseUrl !== 'string') {
      return rawBaseUrl;
    }

    // Ensure it is a valid URL (add protocol if missing)
    const withProtocol = /^https?:\/\//i.test(rawBaseUrl)
      ? rawBaseUrl
      : `https://${rawBaseUrl}`;

    const url = new URL(withProtocol);

    // If host is workspace format like "workspace--account.myvtex.com",
    // preserve original host to keep workspace context for Master Data APIs
    const host = url.hostname;

    // Already stable domain
    if (/\.vtexcommercestable\.com\.br$/i.test(host)) {
      return `https://${host}`;
    }

    // myvtex.com pattern (preserve as-is, including workspace prefix)
    const workspacePattern = /^(?:([a-z0-9-]+)--)?([a-z0-9-]+)\.myvtex\.com$/i;
    const match = host.match(workspacePattern);
    if (match) {
      // keep the original myvtex.com host untouched
      return `https://${host}`;
    }

    // Custom domains should be routed to stable domain for Master Data APIs
    // Requires VTEX_ACCOUNT in env to build the stable hostname
    const account = process.env.VTEX_ACCOUNT;
    if (account) {
      return `https://${account}.vtexcommercestable.com.br`;
    }

    // Fallback: keep as given (may cause HTML/login responses)
    return `https://${host}`;
  } catch (e) {
    return rawBaseUrl;
  }
}

module.exports = { normalizeVtexBaseUrl };


