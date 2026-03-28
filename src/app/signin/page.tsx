"use client";

import { useState } from "react";
import { Lock, Mail, ArrowRight, Mic } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate network delay for mock sign-in
    setTimeout(() => {
      router.push("/");
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4 sm:px-6 overflow-y-auto w-full h-full">
      <div className="w-full max-w-[400px] animate-fade-in-up py-12">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <img 
            src="/voicekhaatha-logo.png" 
            alt="VoiceKhaatha Logo" 
            className="h-20 w-auto mx-auto mb-6 object-contain" 
          />
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-text-secondary text-sm">
            Enter your details to access VoiceTrace
          </p>
        </div>

        {/* Card for Form */}
        <div className="card p-6 sm:p-8">
          <form onSubmit={handleSignIn} className="space-y-6">
            <div className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-text-muted" />
                  </div>
                  <input
                    type="email"
                    required
                    defaultValue="vendor@voicetrace.app"
                    className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-[#387B8A] focus:border-[#387B8A] sm:text-sm bg-surface-light transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-text-muted" />
                  </div>
                  <input
                    type="password"
                    required
                    defaultValue="password123"
                    className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-[#387B8A] focus:border-[#387B8A] sm:text-sm bg-surface-light transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 text-[#387B8A] focus:ring-[#387B8A] border-border rounded cursor-pointer bg-surface-light"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-text-secondary cursor-pointer select-none">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-[#387B8A] hover:text-[#275A65] transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-2.5 px-4 rounded-xl border border-transparent shadow-sm text-sm font-semibold text-white bg-[#387B8A] hover:bg-[#275A65] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#387B8A] transition-all disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.98]"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </button>
          </form>

          {/* Mock SSO / Alternative Login */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface text-text-muted">Or continue with</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handleSignIn(e as any); }}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-border rounded-xl shadow-sm bg-white text-sm font-medium text-text-secondary hover:bg-surface-light transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>
            </div>
          </div>

          {/* Create account prompt */}
          <div className="mt-8 text-center text-sm text-text-secondary">
            Don't have an account?{" "}
            <Link href="#" className="font-medium text-[#387B8A] hover:text-[#275A65] transition-colors">
              Sign up for free
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
