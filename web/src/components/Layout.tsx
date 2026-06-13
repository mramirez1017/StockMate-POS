import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Tags,
  Truck,
  ClipboardList,
  Warehouse,
  Trash2,
  Percent,
  CreditCard,
  ShoppingCart,
  BarChart3,
  Users,
  MapPin,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isStoreAdmin, isManagerOrAbove } from "@/lib/permissions";
import { branchName, useBranches } from "@/lib/useBranches";
import { pageTitle } from "@/lib/pageTitles";
import PlatformStoreSelector from "@/components/PlatformStoreSelector";
import BranchFilter from "@/components/BranchFilter";
import AppFooter from "@/components/AppFooter";
import NotificationBell from "@/components/NotificationBell";
import { useNotifications } from "@/hooks/useNotifications";
import type { User } from "@stockmate/types";

type NavRoles = "all" | "admin" | "manager";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  roles: NavRoles;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const platformNavGroups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { to: "/stores", icon: Building2, label: "Stores", roles: "all" },
      { to: "/users?tab=platform", icon: Users, label: "Registrations", roles: "all" },
      { to: "/analytics", icon: BarChart3, label: "Analytics", roles: "all" },
    ],
  },
];

const storeNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: "all" }],
  },
  {
    label: "Catalog",
    items: [
      { to: "/products", icon: Package, label: "Products", roles: "admin" },
      { to: "/categories", icon: Tags, label: "Categories", roles: "admin" },
      { to: "/suppliers", icon: Truck, label: "Suppliers", roles: "admin" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/purchase-orders", icon: ClipboardList, label: "Purchase Orders", roles: "manager" },
      { to: "/deliveries", icon: Truck, label: "Deliveries", roles: "all" },
      { to: "/inventory", icon: Warehouse, label: "Inventory", roles: "all" },
      { to: "/disposal", icon: Trash2, label: "Stock Disposal", roles: "all" },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/sales", icon: ShoppingCart, label: "Sales", roles: "manager" },
      { to: "/promos", icon: Percent, label: "Promos & Discounts", roles: "admin" },
      { to: "/reports", icon: BarChart3, label: "Reports", roles: "manager" },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/users?tab=store", icon: Users, label: "Users & Roles", roles: "admin" },
      { to: "/branches", icon: MapPin, label: "Branches", roles: "admin" },
      { to: "/settings", icon: Settings, label: "Settings", roles: "admin" },
    ],
  },
];

const shortcutItems: NavItem[] = [
  { to: "/pos", icon: CreditCard, label: "POS (New Sale)", roles: "all" },
  { to: "/deliveries", icon: Truck, label: "Receive Delivery", roles: "all" },
  { to: "/disposal", icon: Trash2, label: "Stock Disposal", roles: "all" },
  { to: "/inventory", icon: Search, label: "Product Search", roles: "all" },
];

function canSeeNavItem(item: NavItem, user: User | null, isPlatformOwner: boolean): boolean {
  if (isPlatformOwner && item.to === "/pos") return false;
  if (item.roles === "all") return !!user || isPlatformOwner;
  if (!user) return false;
  if (item.roles === "admin" && isStoreAdmin(user)) return true;
  if (item.roles === "manager" && isManagerOrAbove(user)) return true;
  return false;
}

function filterNavItems(items: NavItem[], user: User | null, isPlatformOwner: boolean): NavItem[] {
  return items.filter((item) => canSeeNavItem(item, user, isPlatformOwner));
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function NavItemLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const { icon: Icon, label, to, badge } = item;

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

function SidebarContent({
  onNavigate,
  deliveryBadge,
  groups,
  showShortcuts,
  user,
  displayName,
  displayRole,
  branches,
  branchId,
  onBranchChange,
  isPlatformOwner,
}: {
  onNavigate: () => void;
  deliveryBadge: number;
  groups: NavGroup[];
  showShortcuts: boolean;
  user: User | null;
  displayName: string;
  displayRole: string;
  branches: ReturnType<typeof useBranches>["branches"];
  branchId: string;
  onBranchChange: (id: string) => void;
  isPlatformOwner: boolean;
}) {
  const filteredShortcuts = filterNavItems(shortcutItems, user, isPlatformOwner);

  return (
    <>
      <div className="sidebar-brand">
        <img src="/sidebar-icon.png" alt="" className="sidebar-brand-mark" aria-hidden />
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">
            Stock<span className="text-brand-600">Mate</span>
          </span>
          <span className="sidebar-brand-badge">POS</span>
        </div>
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 space-y-5 px-3 py-4">
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <div key={group.label}>
              <p className="nav-section-label">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItemLink
                    key={item.to}
                    item={
                      item.to === "/deliveries" ? { ...item, badge: deliveryBadge } : item
                    }
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ),
        )}

        {showShortcuts && filteredShortcuts.length > 0 && (
          <div>
            <p className="nav-section-label">Shortcuts</p>
            <div className="space-y-0.5">
              {filteredShortcuts.map((item) => (
                <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {(user || isPlatformOwner) && (
        <div className="shrink-0 border-t border-slate-200/80 p-3">
          <div className="user-sidebar-card">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {getInitials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="truncate text-xs capitalize text-slate-500">{displayRole.toLowerCase()}</p>
              </div>
            </div>
            {user && branches.length > 0 && (
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Branch
                </label>
                {isStoreAdmin(user) ? (
                  <BranchFilter
                    branches={branches.filter((b) => b.status === "ACTIVE")}
                    user={user}
                    value={branchId}
                    onChange={onBranchChange}
                    showAllOption={false}
                    className="input-field py-2 text-xs"
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
                    <MapPin size={14} className="text-brand-600" />
                    {branchName(branches, user.branchId)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Layout() {
  const { user, storeId, isPlatformOwner, platformOwner, logout } = useAuth();
  const { branches } = useBranches(storeId);
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerBranchId, setHeaderBranchId] = useState("");
  const { notifications, count: notificationCount, deliveryCount: deliveryBadge } = useNotifications(
    storeId,
    user,
  );

  const displayName = platformOwner?.fullName ?? user?.fullName ?? "User";
  const displayRole = isPlatformOwner ? "Platform Owner" : (user?.role?.replace(/_/g, " ") ?? "");
  const title = pageTitle(location.pathname);

  useEffect(() => {
    if (user?.branchId) setHeaderBranchId(user.branchId);
    else if (branches.length > 0) {
      setHeaderBranchId(branches.find((b) => b.status === "ACTIVE")?.id ?? branches[0].id);
    }
  }, [user, branches]);

  const navGroups = useMemo(() => {
    const groups: NavGroup[] = [];
    if (isPlatformOwner) {
      const platformItems = filterNavItems(platformNavGroups[0].items, user, isPlatformOwner);
      if (platformItems.length > 0) {
        groups.push({ ...platformNavGroups[0], items: platformItems });
      }
    }
    if (user) {
      storeNavGroups.forEach((group) => {
        const items = filterNavItems(group.items, user, isPlatformOwner);
        if (items.length > 0) groups.push({ ...group, items });
      });
    }
    return groups;
  }, [user, isPlatformOwner]);

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebarProps = {
    onNavigate: closeSidebar,
    deliveryBadge,
    groups: navGroups,
    showShortcuts: !!user && !isPlatformOwner,
    user,
    displayName,
    displayRole,
    branches,
    branchId: headerBranchId,
    onBranchChange: setHeaderBranchId,
    isPlatformOwner,
  };

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-[#f3f4f6]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={closeSidebar} aria-hidden />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200/80 bg-[#fafafa] safe-top lg:flex">
        <SidebarContent {...sidebarProps} onNavigate={() => {}} />
      </aside>

      {/* Mobile / tablet drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-slate-200 bg-[#fafafa] transition duration-200 safe-top lg:hidden ${
          sidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <button
          className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 lg:hidden"
          onClick={closeSidebar}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
        <SidebarContent {...sidebarProps} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-topbar safe-top">
          <div className="app-topbar-row">
            <button
              onClick={() => setSidebarOpen(true)}
              className="-ml-1 rounded-lg p-2.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 sm:text-lg lg:max-w-[40%]">
              {title}
            </h1>

            <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
              {isPlatformOwner ? (
                <div className="w-full max-w-sm">
                  <PlatformStoreSelector />
                </div>
              ) : (
                user &&
                branches.length > 0 && (
                  <div className="flex max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <Building2 size={16} className="shrink-0 text-brand-600" />
                    {isStoreAdmin(user) ? (
                      <BranchFilter
                        branches={branches.filter((b) => b.status === "ACTIVE")}
                        user={user}
                        value={headerBranchId}
                        onChange={setHeaderBranchId}
                        showAllOption={isStoreAdmin(user)}
                        className="min-h-0 flex-1 border-0 bg-transparent py-0 pl-0 pr-8 text-sm font-medium shadow-none focus:ring-0"
                      />
                    ) : (
                      <span className="truncate text-sm font-medium text-slate-700">
                        {branchName(branches, user.branchId)}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              {user && storeId && (
                <NotificationBell notifications={notifications} count={notificationCount} />
              )}

              <button
                onClick={handleLogout}
                className="rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={20} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {isPlatformOwner ? (
            <div className="app-context-bar">
              <PlatformStoreSelector />
            </div>
          ) : (
            user &&
            branches.length > 0 && (
              <div className="app-context-bar">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="shrink-0 text-brand-600" />
                  {isStoreAdmin(user) ? (
                    <BranchFilter
                      branches={branches.filter((b) => b.status === "ACTIVE")}
                      user={user}
                      value={headerBranchId}
                      onChange={setHeaderBranchId}
                      showAllOption={isStoreAdmin(user)}
                      className="input-field min-h-[40px] flex-1 py-2 text-sm"
                    />
                  ) : (
                    <span className="truncate text-sm font-medium text-slate-700">
                      {branchName(branches, user.branchId)}
                    </span>
                  )}
                </div>
              </div>
            )
          )}
        </header>

        <main className="app-main">
          <Outlet />
          <AppFooter />
        </main>
      </div>
    </div>
  );
}
