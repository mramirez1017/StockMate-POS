import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";

function GoogleSignInButton({
  signingIn,
  onLogin,
}: {
  signingIn: boolean;
  onLogin: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLogin}
      disabled={signingIn}
      className="btn-primary w-full py-3 shadow-lg shadow-slate-900/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {signingIn ? (
        <>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Signing in...
        </>
      ) : (
        <>
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </>
      )}
    </button>
  );
}

function LoginForm({
  displayError,
  settingUpAccount,
  showUnregistered,
  signedInUser,
  signingIn,
  onLogin,
  onLogout,
  compact = false,
}: {
  displayError: string | null;
  settingUpAccount: boolean;
  showUnregistered: boolean;
  signedInUser: { email: string | null } | null;
  signingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  compact?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-sm animate-slide-up">
      {!compact && (
        <div className="mb-8">
          <div className="mb-5 flex items-center gap-3">
            <img
              src="/sidebar-icon.png"
              alt="StockMate"
              className="h-12 w-12 rounded-xl shadow-glow-sm"
            />
            <span className="bg-gradient-to-r from-brand-700 to-accent-600 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              StockMate POS
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to manage inventory, sales, and deliveries.</p>
        </div>
      )}

      {compact && (
        <div className="mb-6 flex flex-col items-center gap-3">
          <img
            src="/sidebar-icon.png"
            alt="StockMate"
            className="h-16 w-16 rounded-2xl shadow-glow"
          />
          <span className="text-lg font-bold tracking-tight text-white drop-shadow-md">StockMate POS</span>
        </div>
      )}

      {displayError && (
        <div className="mb-4 rounded-lg border border-red-300/40 bg-red-50/90 px-4 py-3 text-sm text-red-700 backdrop-blur-sm">
          {displayError}
        </div>
      )}

      {settingUpAccount ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-600">Setting up your account...</p>
        </div>
      ) : showUnregistered ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-300/40 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 backdrop-blur-sm">
            Signed in as <strong>{signedInUser?.email}</strong>, but this email is not registered yet. Ask the
            platform administrator to add your email before signing in.
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="btn-secondary w-full border-slate-300/40 bg-white/80 py-3 backdrop-blur-sm"
          >
            Sign out and try another account
          </button>
        </div>
      ) : (
        <GoogleSignInButton signingIn={signingIn} onLogin={onLogin} />
      )}

      {!compact && (
        <p className="mt-8 text-center text-xs text-slate-500">© {new Date().getFullYear()} StockMate POS</p>
      )}
    </div>
  );
}

export default function Login() {
  const {
    hasAccess,
    isPlatformOwner,
    analyticsStoreId,
    signedInUser,
    loading,
    signingIn,
    authError,
    clearAuthError,
    signInWithGoogle,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (hasAccess) {
      navigate(isPlatformOwner ? (analyticsStoreId ? "/dashboard" : "/stores") : "/dashboard", { replace: true });
    }
  }, [hasAccess, isPlatformOwner, analyticsStoreId, loading, navigate]);

  const handleLogin = async () => {
    setLocalError(null);
    clearAuthError();
    try {
      await signInWithGoogle();
    } catch {
      // Error is set in AuthContext
    }
  };

  const displayError = localError ?? authError;
  const settingUpAccount = signedInUser && !hasAccess && (loading || signingIn);
  const showUnregistered = signedInUser && !hasAccess && !loading && !signingIn;

  if (loading && !signedInUser) return <LoadingSpinner />;

  const formProps = {
    displayError,
    settingUpAccount: !!settingUpAccount,
    showUnregistered: !!showUnregistered,
    signedInUser,
    signingIn,
    onLogin: handleLogin,
    onLogout: () => void logout(),
  };

  return (
    <div className="relative flex min-h-dvh flex-col md:flex-row">
      {/* Branded login screen — mobile full bleed, desktop left pane */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-top bg-no-repeat md:hidden"
        style={{ backgroundImage: "url(/login-bg.png)" }}
        aria-hidden
      />

      {/* Mobile: sign-in button centered on the branded screen */}
      <main className="relative z-10 flex min-h-dvh flex-1 items-center justify-center px-8 safe-top safe-bottom md:hidden">
        <div className="w-full max-w-xs">
          <LoginForm {...formProps} compact />
        </div>
      </main>

      {/* Desktop / tablet split layout */}
      <div
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-left bg-no-repeat md:block"
        style={{ backgroundImage: "url(/login-bg.png)" }}
        aria-hidden
      />
      <div className="hidden flex-1 md:block" aria-hidden />
      <main className="relative hidden flex-1 items-center justify-center px-6 py-10 safe-top safe-bottom sm:px-10 md:flex md:w-[min(100%,480px)] md:flex-none lg:w-[520px] xl:w-[560px]">
        <div className="w-full max-w-sm rounded-2xl border border-white/50 bg-white/70 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
          <LoginForm {...formProps} />
        </div>
      </main>
    </div>
  );
}
