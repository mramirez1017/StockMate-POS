import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import LoadingSpinner from "@/components/LoadingSpinner";
import { HomeRedirect, StoreStaffRoute, PlatformOwnerRoute, UserManagementRoute, PosRoute } from "@/components/RouteGuards";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Pos from "@/pages/Pos";
import Products from "@/pages/Products";
import Categories from "@/pages/Categories";
import Suppliers from "@/pages/Suppliers";
import PurchaseOrders from "@/pages/PurchaseOrders";
import UpcomingDeliveries from "@/pages/UpcomingDeliveries";
import DeliveryChecklist from "@/pages/DeliveryChecklist";
import Inventory from "@/pages/Inventory";
import StockDisposal from "@/pages/StockDisposal";
import Promos from "@/pages/Promos";
import Sales from "@/pages/Sales";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import Branches from "@/pages/Branches";
import Settings from "@/pages/Settings";
import Stores from "@/pages/Stores";
import Analytics from "@/pages/Analytics";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { hasAccess, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!hasAccess) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="dashboard" element={<StoreStaffRoute><Dashboard /></StoreStaffRoute>} />
        <Route path="pos" element={<PosRoute><Pos /></PosRoute>} />
        <Route path="stores" element={<PlatformOwnerRoute><Stores /></PlatformOwnerRoute>} />
        <Route path="analytics" element={<PlatformOwnerRoute><Analytics /></PlatformOwnerRoute>} />
        <Route path="users" element={<UserManagementRoute><Users /></UserManagementRoute>} />
        <Route path="products" element={<StoreStaffRoute><Products /></StoreStaffRoute>} />
        <Route path="categories" element={<StoreStaffRoute><Categories /></StoreStaffRoute>} />
        <Route path="suppliers" element={<StoreStaffRoute><Suppliers /></StoreStaffRoute>} />
        <Route path="purchase-orders" element={<StoreStaffRoute><PurchaseOrders /></StoreStaffRoute>} />
        <Route path="deliveries" element={<StoreStaffRoute><UpcomingDeliveries /></StoreStaffRoute>} />
        <Route path="deliveries/:poId" element={<StoreStaffRoute><DeliveryChecklist /></StoreStaffRoute>} />
        <Route path="inventory" element={<StoreStaffRoute><Inventory /></StoreStaffRoute>} />
        <Route path="disposal" element={<StoreStaffRoute><StockDisposal /></StoreStaffRoute>} />
        <Route path="promos" element={<StoreStaffRoute><Promos /></StoreStaffRoute>} />
        <Route path="sales" element={<StoreStaffRoute><Sales /></StoreStaffRoute>} />
        <Route path="reports" element={<StoreStaffRoute><Reports /></StoreStaffRoute>} />
        <Route path="branches" element={<StoreStaffRoute><Branches /></StoreStaffRoute>} />
        <Route path="settings" element={<StoreStaffRoute><Settings /></StoreStaffRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
