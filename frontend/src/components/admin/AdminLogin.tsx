import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, ArrowRight, Shield } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';

export function AdminLogin() {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Validate against /verify, which checks the key and nothing else.
      // This used to call /stats, which reads HubSpot — so any HubSpot outage
      // locked staff out with a misleading "Invalid API key".
      const response = await fetch('/api/admin/verify', {
        headers: {
          'X-API-Key': apiKey.trim()
        }
      });

      if (response.ok) {
        localStorage.setItem('admin_api_key', apiKey.trim());
        navigate('/admin');
      } else if (response.status === 401) {
        setError('Invalid API key');
      } else {
        // Distinguish "your key is wrong" from "the server is unwell".
        setError('The server could not verify your key right now. Please try again shortly.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access</h2>
          <p className="text-gray-600">
            Enter your API key to access the admin dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="label">
              API Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="input pl-10"
                disabled={isLoading}
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3"
          >
            {isLoading ? (
              <LoadingSpinner size="sm" className="mr-2" />
            ) : (
              <>
                Access Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Contact your administrator if you need access credentials.
        </p>
      </div>
    </div>
  );
}
