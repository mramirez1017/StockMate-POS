import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { User, Store, PlatformOwner } from "@stockmate/types";
import { auth, db } from "@/firebase";
import { api, setApiStoreContext } from "@/lib/api";
import { emailDocId, normalizeEmail } from "@/lib/email";
import { createPlatformStoreViewUser } from "@/lib/platformStoreView";

const ANALYTICS_STORE_KEY = "stockmate_analytics_store";

interface AuthState {
  /** Google account session before store profile is loaded. */
  signedInUser: FirebaseUser | null;
  /** Effective user for the current view (synthetic admin when PO has a store selected). */
  user: User | null;
  store: Store | null;
  /** Effective store scope — set when PO selects a store to view. */
  storeId: string | null;
  isPlatformOwner: boolean;
  platformOwner: PlatformOwner | null;
  /** Selected store for platform owner (persisted in localStorage). */
  analyticsStoreId: string | null;
  hasAccess: boolean;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setAnalyticsStoreId: (id: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function sanitizeUserFacingError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "";

  const withoutSdkPrefix = trimmed.replace(/^Firebase:\s*Error\s*\([^)]+\)\.?\s*/i, "").trim();
  const cleaned = (withoutSdkPrefix || trimmed)
    .replace(/\S+\.firebaseapp\.com/gi, "StockMate POS")
    .replace(/\S+\.firebasestorage\.app/gi, "StockMate POS")
    .replace(/\S+\.web\.app/gi, "StockMate POS");

  if (/^auth\//.test(cleaned) || /firebase/i.test(cleaned) || /firestore/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function mapAuthError(code: string, rawMessage?: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled. Please try again.";
    case "auth/popup-blocked":
      return "Popup was blocked by your browser. Allow popups for this site and try again.";
    case "auth/cancelled-popup-request":
      return "Another sign-in is already in progress. Please wait.";
    case "auth/operation-not-allowed":
      return "Google Sign-In is not available for this app. Contact your administrator.";
    case "auth/unauthorized-domain":
      return "This site is not authorized for sign-in. Contact your administrator.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    default: {
      const friendly = sanitizeUserFacingError(rawMessage ?? "");
      return friendly || "Sign-in failed. Please try again.";
    }
  }
}

function mapCallableError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const message = sanitizeUserFacingError((err as { message?: string })?.message ?? "");
  if (code === "functions/permission-denied") {
    return message || "Your email is not registered. Contact the platform administrator to be added.";
  }
  if (code === "functions/failed-precondition") {
    return message || "This account cannot be activated.";
  }
  return message || "Could not complete sign-in. Please try again.";
}

async function readUserStoreIndex(uid: string, retries = 4) {
  for (let i = 0; i < retries; i++) {
    const snap = await getDoc(doc(db, "userStoreIndex", uid));
    if (snap.exists()) return snap;
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return getDoc(doc(db, "userStoreIndex", uid));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedInUser, setSignedInUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [platformOwner, setPlatformOwner] = useState<PlatformOwner | null>(null);
  const [analyticsStoreId, setAnalyticsStoreIdState] = useState<string | null>(() =>
    localStorage.getItem(ANALYTICS_STORE_KEY)
  );
  const [analyticsStore, setAnalyticsStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Live listener on the signed-in user's profile so role/status/permission
  // changes made by an admin reflect immediately, without a re-login.
  const userUnsubRef = useRef<null | (() => void)>(null);

  const stopWatchingUser = useCallback(() => {
    userUnsubRef.current?.();
    userUnsubRef.current = null;
  }, []);

  /** Keep `user` in sync with live edits to their profile document. */
  const watchUser = useCallback((sid: string, uid: string) => {
    stopWatchingUser();
    userUnsubRef.current = onSnapshot(
      doc(db, "stores", sid, "users", uid),
      (snap) => {
        if (!snap.exists()) {
          setUser(null);
          setAuthError("User profile not found. Contact your administrator.");
          return;
        }
        const userData = { id: snap.id, ...snap.data() } as User;
        if (userData.status !== "ACTIVE") {
          setUser(null);
          setAuthError("Your account is inactive. Contact your administrator.");
          return;
        }
        if (userData.storeId !== sid) {
          setUser(null);
          setAuthError("Store assignment mismatch. Contact your administrator.");
          return;
        }
        setAuthError(null);
        setUser(userData);
      },
      (err) => console.error("user profile listener error", err)
    );
  }, [stopWatchingUser]);

  const loadStoreDoc = async (sid: string) => {
    const storeSnap = await getDoc(doc(db, "stores", sid));
    if (storeSnap.exists()) {
      return { id: storeSnap.id, ...storeSnap.data() } as Store;
    }
    return null;
  };

  const applyPlatformOwnerSession = async (po: PlatformOwner) => {
    stopWatchingUser();
    setIsPlatformOwner(true);
    setPlatformOwner(po);
    setUser(null);
    setStoreId(null);
    setStore(null);

    localStorage.removeItem("stockmate_selected_store");

    const aid = analyticsStoreId ?? localStorage.getItem(ANALYTICS_STORE_KEY);
    if (aid) {
      setAnalyticsStoreIdState(aid);
      const s = await loadStoreDoc(aid);
      setAnalyticsStore(s);
    }
  };

  const tryResolvePlatformOwner = async (
    fbUser: FirebaseUser
  ): Promise<PlatformOwner | null> => {
    const poSnap = await getDoc(doc(db, "platformOwners", fbUser.uid));
    if (poSnap.exists()) {
      return { id: poSnap.id, ...poSnap.data() } as PlatformOwner;
    }

    const indexSnap = await getDoc(doc(db, "userStoreIndex", fbUser.uid));
    if (indexSnap.exists() && indexSnap.data().isPlatformOwner) {
      const email = fbUser.email ?? "";
      return {
        id: fbUser.uid,
        email,
        fullName: fbUser.displayName ?? email,
        createdAt: Date.now(),
      };
    }

    if (!fbUser.email) return null;

    const emailKey = emailDocId(normalizeEmail(fbUser.email));
    const regSnap = await getDoc(doc(db, "registeredEmails", emailKey));
    if (!regSnap.exists()) return null;

    const reg = regSnap.data();
    if (reg.role !== "PLATFORM_OWNER" || reg.status !== "ACTIVE") return null;
    if (reg.claimedUid && reg.claimedUid !== fbUser.uid) return null;

    try {
      await api.repairPlatformOwnerSession({});
      const repaired = await getDoc(doc(db, "platformOwners", fbUser.uid));
      if (repaired.exists()) {
        return { id: repaired.id, ...repaired.data() } as PlatformOwner;
      }
    } catch (err) {
      console.error("Platform owner session repair failed:", err);
    }

    return null;
  };

  const loadProfile = useCallback(
    async (fbUser: FirebaseUser) => {
      setAuthError(null);

      const po = await tryResolvePlatformOwner(fbUser);
      if (po) {
        await applyPlatformOwnerSession(po);
        return;
      }

      setIsPlatformOwner(false);
      setPlatformOwner(null);
      setAnalyticsStoreIdState(null);
      setAnalyticsStore(null);
      localStorage.removeItem(ANALYTICS_STORE_KEY);
      localStorage.removeItem("stockmate_selected_store");

      let indexSnap = await getDoc(doc(db, "userStoreIndex", fbUser.uid));

      if (!indexSnap.exists()) {
        try {
          await api.claimAccount({});
          indexSnap = await readUserStoreIndex(fbUser.uid);
        } catch (err) {
          console.error("Account claim failed:", err);
          setUser(null);
          setStore(null);
          setStoreId(null);
          setAuthError(mapCallableError(err));
          return;
        }
      }

      if (!indexSnap.exists()) {
        setUser(null);
        setStore(null);
        setStoreId(null);
        setAuthError("Your email is not registered. Contact the platform administrator to be added.");
        return;
      }

      const indexData = indexSnap.data();
      if (indexData.isPlatformOwner) {
        const poRetry = await tryResolvePlatformOwner(fbUser);
        if (poRetry) {
          await applyPlatformOwnerSession(poRetry);
        }
        return;
      }

      const sid = indexData.storeId as string;
      if (!sid) {
        setAuthError("Your account is not linked to a store.");
        return;
      }

      setStoreId(sid);

      let userSnap = await getDoc(doc(db, "stores", sid, "users", fbUser.uid));
      if (!userSnap.exists()) {
        await new Promise((r) => setTimeout(r, 500));
        userSnap = await getDoc(doc(db, "stores", sid, "users", fbUser.uid));
      }
      if (!userSnap.exists()) {
        setUser(null);
        setStore(null);
        setAuthError("User profile not found. Contact your administrator.");
        return;
      }

      const userData = { id: userSnap.id, ...userSnap.data() } as User;
      if (userData.status !== "ACTIVE") {
        setUser(null);
        setAuthError("Your account is inactive. Contact your administrator.");
        return;
      }

      if (userData.storeId !== sid) {
        setAuthError("Store assignment mismatch. Contact your administrator.");
        setUser(null);
        return;
      }

      setUser(userData);
      const storeDoc = await loadStoreDoc(sid);
      setStore(storeDoc);

      // Stay subscribed to live profile changes (permissions, role, status).
      watchUser(sid, fbUser.uid);
    },
    [analyticsStoreId, watchUser]
  );

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      setSignedInUser(fbUser);
      if (!fbUser) {
        stopWatchingUser();
        setUser(null);
        setStore(null);
        setStoreId(null);
        setIsPlatformOwner(false);
        setPlatformOwner(null);
        setAnalyticsStoreIdState(null);
        setAnalyticsStore(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setAuthError(null);

      try {
        await loadProfile(fbUser);
      } catch (err) {
        console.error("Failed to load user profile:", err);
        setUser(null);
        setAuthError("Could not load your profile. Please try again.");
      } finally {
        setLoading(false);
      }
    });
    return () => {
      unsubAuth();
      stopWatchingUser();
    };
  }, [loadProfile, stopWatchingUser]);

  const setAnalyticsStoreId = async (id: string | null) => {
    setAnalyticsStoreIdState(id);
    if (id) {
      localStorage.setItem(ANALYTICS_STORE_KEY, id);
      setAnalyticsStore(await loadStoreDoc(id));
    } else {
      localStorage.removeItem(ANALYTICS_STORE_KEY);
      setAnalyticsStore(null);
    }
  };

  const refreshProfile = async () => {
    if (!signedInUser) return;
    setLoading(true);
    try {
      await loadProfile(signedInUser);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      const message = (err as { message?: string })?.message ?? "";
      console.error("Google sign-in error:", code, message);
      setAuthError(mapAuthError(code, message));
      throw err;
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  const hasAccess = !!user || isPlatformOwner;

  const effectiveStoreId = isPlatformOwner ? analyticsStoreId : storeId;
  const effectiveStore = isPlatformOwner ? analyticsStore : store;
  const effectiveUser = useMemo(() => {
    if (!isPlatformOwner) return user;
    if (!analyticsStoreId || !platformOwner) return null;
    return createPlatformStoreViewUser(platformOwner, analyticsStoreId);
  }, [isPlatformOwner, analyticsStoreId, platformOwner, user]);

  useEffect(() => {
    setApiStoreContext(isPlatformOwner ? analyticsStoreId : storeId);
  }, [isPlatformOwner, analyticsStoreId, storeId]);

  return (
    <AuthContext.Provider
      value={{
        signedInUser,
        user: effectiveUser,
        store: effectiveStore,
        storeId: effectiveStoreId,
        isPlatformOwner,
        platformOwner,
        analyticsStoreId,
        hasAccess,
        loading,
        signingIn,
        authError,
        clearAuthError: () => setAuthError(null),
        signInWithGoogle,
        logout,
        refreshProfile,
        setAnalyticsStoreId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Store-scoped data reads — ready when staff or PO with a selected store. */
export function useStoreScope() {
  const { storeId, user } = useAuth();
  return { storeId, user, ready: !!storeId && !!user };
}
