
import React, { useState } from 'react';
import { authService } from '../services/supabaseService';
import { Icons } from './Icons';

interface AuthProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const AuthView: React.FC<AuthProps> = ({ onSuccess, onCancel }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (isLogin) {
        await authService.signIn(email, password);
      } else {
        await authService.signUp(email, password);
        // Supabase often requires email confirmation, but we'll assume auto-confirm for dev
        // or let the user know to check email if configured that way.
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
        
        <div className="text-center mb-8">
            <div className="w-16 h-16 bg-chrp-teal/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icons.ShieldCheck className="w-8 h-8 text-chrp-teal" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
                {isLogin ? 'Sign in to save and manage reports' : 'Get started with ChrpInspect AI'}
            </p>
        </div>

        {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
                <Icons.AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email</label>
                <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    placeholder="name@example.com"
                />
            </div>
            <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Password</label>
                <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-chrp-teal"
                    placeholder="••••••••"
                    minLength={6}
                />
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-chrp-teal text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:bg-teal-500 transition-all flex items-center justify-center gap-2 mt-4"
            >
                {isLoading && <Icons.Loader2 className="animate-spin" />}
                {isLogin ? 'Sign In' : 'Create Account'}
            </button>
        </form>

        <div className="mt-6 text-center">
            <button 
                onClick={() => { setError(''); setIsLogin(!isLogin); }}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-chrp-teal dark:hover:text-chrp-teal font-medium"
            >
                {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
        </div>
        
        <div className="mt-4 text-center">
            <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                Cancel
            </button>
        </div>

      </div>
    </div>
  );
};
