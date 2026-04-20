/**
 * Get the API URL for making requests
 * Checks the current hostname to determine environment
 * - localhost/127.0.0.1: development (uses relative proxy path)
 * - Vercel/other: production (uses full Render backend URL)
 */
export function getApiUrl(path: string): string {
  // If on localhost (development), use relative path (proxied by Vite)
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return path;
  }
  
  // If on 127.0.0.1 (development), use relative path
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    return path;
  }
  
  // Production: use full Render backend URL
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
    return 'https://arena-rush-backend.onrender.com' + path;
  }
  
  // Fallback: use relative path
  return path;
}
