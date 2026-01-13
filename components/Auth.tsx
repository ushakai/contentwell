import React, { useState } from 'react';
import { signUp, signIn } from '../services/authService';

const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { user, error: signInError } = await signIn(email, password);
        if (signInError) {
          throw new Error(signInError);
        }
        if (user) {
          setMessage('Signing in...');
          // AuthContext will pick up the session from localStorage
          window.location.reload();
        }
      } else {
        const trimmedName = name.trim();
        if (!trimmedName) {
          throw new Error('Please enter your name to continue.');
        }

        const { user, error: signUpError } = await signUp(email, password, trimmedName);
        if (signUpError) {
          throw new Error(signUpError);
        }
        if (user) {
          setMessage('Account created! Redirecting you now...');
          // AuthContext will pick up the session from localStorage
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-sm border">
        <div className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-4">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">ContentWell</h1>
            </div>
          <p className="text-muted-foreground">{isLogin ? 'Sign in to your account' : 'Create a new account'}</p>
        </div>
        <form className="space-y-6" onSubmit={handleAuth}>
          {error && <p className="text-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</p>}
          {message && <p className="text-center text-sm text-green-700 bg-green-500/10 p-3 rounded-md">{message}</p>}
          {!isLogin && (
            <div className="relative">
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="peer h-12 w-full border border-input bg-transparent p-4 text-foreground placeholder-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
                placeholder="Jane Doe"
              />
              <label
                htmlFor="name"
                className="absolute left-3 -top-2.5 text-muted-foreground text-sm transition-all bg-card px-1 peer-placeholder-shown:text-base peer-placeholder-shown:text-muted-foreground peer-placeholder-shown:top-2.5 peer-placeholder-shown:bg-transparent peer-placeholder-shown:px-0 peer-focus:-top-2.5 peer-focus:text-primary peer-focus:text-sm peer-focus:bg-card peer-focus:px-1"
              >
                Full name
              </label>
            </div>
          )}
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="peer h-12 w-full border border-input bg-transparent p-4 text-foreground placeholder-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
              placeholder="john@doe.com"
            />
            <label
              htmlFor="email"
              className="absolute left-3 -top-2.5 text-muted-foreground text-sm transition-all bg-card px-1 peer-placeholder-shown:text-base peer-placeholder-shown:text-muted-foreground peer-placeholder-shown:top-2.5 peer-placeholder-shown:bg-transparent peer-placeholder-shown:px-0 peer-focus:-top-2.5 peer-focus:text-primary peer-focus:text-sm peer-focus:bg-card peer-focus:px-1"
            >
              Email address
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="peer h-12 w-full border border-input bg-transparent p-4 text-foreground placeholder-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
              placeholder="Password"
            />
            <label
              htmlFor="password"
              className="absolute left-3 -top-2.5 text-muted-foreground text-sm transition-all bg-card px-1 peer-placeholder-shown:text-base peer-placeholder-shown:text-muted-foreground peer-placeholder-shown:top-2.5 peer-placeholder-shown:bg-transparent peer-placeholder-shown:px-0 peer-focus:-top-2.5 peer-focus:text-primary peer-focus:text-sm peer-focus:bg-card peer-focus:px-1"
            >
              Password
            </label>
          </div>
          <div>
            <button
              type="submit"
              disabled={loading || (!isLogin && !name.trim())}
              className="w-full inline-flex items-center justify-center rounded-md px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all duration-300 ease-in-out bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
          </div>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button
            onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setMessage(null);
                setName('');
            }}
            className="font-semibold text-primary hover:text-primary/80 ml-2"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;