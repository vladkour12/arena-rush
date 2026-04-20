/**
 * Get the API URL for making requests
 * In production, uses the VITE_API_URL environment variable
 * In development, uses the proxy configuration
 */
export function getApiUrl(path: string): string {
  // Check if __API_URL__ is defined (set during build by vite.config.ts)
  if (typeof (window as any).__API_URL__ !== 'undefined' && (window as any).__API_URL__ !== 'http://localhost:3001') {
    // Production: use the full backend URL
    return (window as any).__API_URL__ + path;
  }
  
  // Development: use relative path (proxied by Vite)
  return path;
}
