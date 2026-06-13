import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

import { canUsePos, isStoreAdmin } from "@/lib/permissions";

import LoadingSpinner from "@/components/LoadingSpinner";

import SelectStorePrompt from "@/components/SelectStorePrompt";



/** Store-scoped pages — platform owner needs a selected store. */

export function StoreStaffRoute({ children }: { children: React.ReactNode }) {

  const { isPlatformOwner, user, storeId, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (isPlatformOwner && !storeId) {

    return (

      <SelectStorePrompt

        title="Select a store to continue"

        message="Pick a store from the header dropdown to view dashboard, reports, inventory, branches, and other store data."

      />

    );

  }

  if (!user || !storeId) return <Navigate to="/login" replace />;

  return <>{children}</>;

}



/** Platform owner only */

export function PlatformOwnerRoute({ children }: { children: React.ReactNode }) {

  const { isPlatformOwner, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (!isPlatformOwner) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;

}



export function HomeRedirect() {

  const { isPlatformOwner, analyticsStoreId, user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (isPlatformOwner) {

    return <Navigate to={analyticsStoreId ? "/dashboard" : "/stores"} replace />;

  }

  if (user?.role === "CASHIER") return <Navigate to="/pos" replace />;

  if (user) return <Navigate to="/dashboard" replace />;

  return <Navigate to="/login" replace />;

}



/** POS — cashier, manager, or admin (not platform owner console view). */

export function PosRoute({ children }: { children: React.ReactNode }) {

  const { isPlatformOwner, user, storeId, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (isPlatformOwner) {

    return (

      <SelectStorePrompt

        title="POS is for store staff"

        message="Platform owners can view sales and reports. Use a store staff account at the register for checkout."

      />

    );

  }

  if (!user || !storeId) return <Navigate to="/login" replace />;

  if (!canUsePos(user)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;

}



/** Users page: platform owner or store admin only */

export function UserManagementRoute({ children }: { children: React.ReactNode }) {

  const { isPlatformOwner, user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (isPlatformOwner) return <>{children}</>;

  if (user && isStoreAdmin(user)) return <>{children}</>;

  return <Navigate to="/dashboard" replace />;

}

