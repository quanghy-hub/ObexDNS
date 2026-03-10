import { useState, useEffect, useRef } from "react";
import {
  Button,
  Navbar,
  Alignment,
  Intent,
  Spinner,
  NonIdealState,
  Card,
  Elevation,
  Tag,
  H3,
  InputGroup,
  OverlayToaster,
  Icon,
  Menu,
  MenuItem,
  Popover,
} from "@blueprintjs/core";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  ListFilter,
  Edit3,
  Settings,
  BarChart3,
  Clock,
  User as UserIcon,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Menu as MenuIcon,
  ChevronRight,
  Plus,
  Trash2,
  Download,
} from "lucide-react";
import { clsx } from "clsx";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  useParams,
  Navigate,
} from "react-router-dom";
import { AuthView } from "./components/AuthView";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { GitHubCorner } from "./components/GithubCorner";
import { FilteringView } from "./views/FilteringView";
import { AccountView } from "./views/AccountView";
import { SettingsView } from "./views/SettingsView";
import { RulesView } from "./views/RulesView";
import { LogsView } from "./views/LogsView";
import { AnalyticsView } from "./views/AnalyticsView";
import { SetupView } from "./views/SetupView";
import LogoIcon from "./assets/Obex_DNS_Logo-256.png";

interface Profile {
  id: string;
  name: string;
}

interface UserInfo {
  id: string;
  username: string;
  role: "admin" | "user";
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

const DashboardHome = ({
  profiles,
  onSelect,
  onCreate,
  showCreate,
  setShowCreate,
  newName,
  setNewName,
  error,
  onDelete,
  handleLogout,
  navigate,
}: any) => {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* 顶部导航栏 - 玻璃拟态 */}
      <div className="sticky top-0 z-30 h-14 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src={LogoIcon}
            alt="Obex DNS"
            className="w-8 h-8 object-contain"
          />
          <span className="font-bold text-lg tracking-tight dark:text-white">
            Obex DNS
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <div className="flex items-center gap-1">
            <Button
              variant="minimal"
              icon={<UserIcon size={18} />}
              text={isMobile ? "" : t("common.account")}
              onClick={() => navigate("/account")}
            />
            <Popover
              content={
                <div className="p-4 space-y-3">
                  <div className="font-bold text-sm">{t("common.confirmLogout")}</div>
                  <Button
                    fill
                    intent={Intent.DANGER}
                    text={t("common.logout")}
                    onClick={handleLogout}
                  />
                </div>
              }
            >
              <Button
                variant="minimal"
                intent={Intent.DANGER}
                icon={<LogOut size={18} />}
                text={isMobile ? "" : t("common.logout")}
              />
            </Popover>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 pt-8 md:pt-4">
        <div className="w-full max-w-md">
          <div className="flex justify-between items-center mb-6">
            <H3
              className="dark:text-white font-bold"
              style={{ marginBottom: 0 }}
            >
              {t("common.selectProfile")}
            </H3>
            <Button
              variant="minimal"
              intent={Intent.PRIMARY}
              icon={<Plus size={18} />}
              onClick={() => setShowCreate(true)}
              text={t("common.add")}
            />
          </div>

          {showCreate && (
            <Card
              elevation={Elevation.TWO}
              className="mb-6 p-4 dark:bg-gray-900 dark:border-gray-800 rounded-xl"
            >
              <div className="flex items-center gap-2">
                <InputGroup
                  fill
                  placeholder={t("common.newProfileName")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <Button
                  intent={Intent.SUCCESS}
                  onClick={onCreate}
                  text={t("common.create")}
                  className="whitespace-nowrap"
                />
                <Button
                  variant="minimal"
                  onClick={() => setShowCreate(false)}
                  icon="cross"
                />
              </div>
              {error && (
                <div className="mt-2 text-red-500 text-xs">
                  {error === "网络错误" ? t("common.errorNetwork") : error}
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-3">
            {profiles.map((p: Profile) => (
              <Card
                key={p.id}
                interactive
                onClick={() => onSelect(p)}
                className="flex justify-between items-center p-4 dark:bg-gray-900 dark:border-gray-800 rounded-xl border border-gray-200"
              >
                <div className="flex flex-col">
                  <span className="font-bold text-base dark:text-white">
                    {p.name}
                  </span>
                  <code className="text-gray-400 text-[10px] font-mono uppercase mt-0.5">
                    {p.id}
                  </code>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="minimal"
                    intent={Intent.DANGER}
                    icon={<Trash2 size={16} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(e, p.id);
                    }}
                  />
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </Card>
            ))}
            {profiles.length === 0 && (
              <NonIdealState
                icon={<ShieldCheck size={48} className="text-gray-300" />}
                title={t("common.welcome")}
                description={t("common.createProfileToStart")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MainLayout = ({
  children,
  isSidebarOpen,
  setIsSidebarOpen,
  theme,
  setTheme,
  selectedProfile,
  profiles,
  setSelectedProfile,
  location,
  navigate,
  handleLogout,
  toasterRef,
  currentUser,
}: any) => {
  const { profileId: urlProfileId } = useParams();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const activeId = urlProfileId || selectedProfile?.id;
  const isProfileActive = !!activeId;

  useEffect(() => {
    if (
      urlProfileId &&
      profiles.length > 0 &&
      selectedProfile?.id !== urlProfileId
    ) {
      const found = profiles.find((p: Profile) => p.id === urlProfileId);
      if (found) setSelectedProfile(found);
    }
  }, [urlProfileId, profiles, selectedProfile, setSelectedProfile]);

  const navItems = [
    {
      id: "setup",
      label: t("nav.setup"),
      icon: <Download size={20} />,
      path: `/dash/${activeId}/setup`,
    },
    {
      id: "rules",
      label: t("nav.rules"),
      icon: <Edit3 size={20} />,
      path: `/dash/${activeId}/rules`,
    },
    {
      id: "stats",
      label: t("nav.stats"),
      icon: <BarChart3 size={20} />,
      path: `/dash/${activeId}/stats`,
    },
    {
      id: "logs",
      label: t("nav.logs"),
      icon: <Clock size={20} />,
      path: `/dash/${activeId}/logs`,
    },
  ];

  return (
    <div className="flex h-screen w-full bg-white dark:bg-gray-950 overflow-hidden flex-col md:flex-row">
      <OverlayToaster position="bottom" ref={toasterRef} />

      {!isMobile && (
        <aside
          className={clsx(
            "flex flex-col border-r border-gray-200 dark:border-gray-800 transition-all duration-300 bg-white dark:bg-gray-900",
            isSidebarOpen ? "w-64" : "w-16",
          )}
        >
          <div className="h-14 flex items-center px-4 shrink-0">
            <img
              src={LogoIcon}
              alt="Obex DNS"
              className="w-8 h-8 object-contain shrink-0"
            />
            {isSidebarOpen && (
              <span className="ml-3 font-bold text-lg dark:text-white">
                Obex DNS
              </span>
            )}
          </div>
          <div className="flex-1 py-4 px-2 overflow-y-auto overflow-x-hidden">
            <Menu className="bg-transparent p-0">
              {navItems.map((item) => (
                <MenuItem
                  key={item.id}
                  icon={item.icon as any}
                  text={isSidebarOpen ? item.label : ""}
                  disabled={!isProfileActive}
                  active={location.pathname.endsWith(
                    item.id === "stats" ? "/stats" : `/${item.id}`,
                  )}
                  onClick={() => navigate(item.path)}
                />
              ))}
              <MenuItem
                icon={<ListFilter size={18} />}
                text={isSidebarOpen ? t("nav.filter") : ""}
                disabled={!isProfileActive}
                active={location.pathname.endsWith("/filter")}
                onClick={() => navigate(`/dash/${activeId}/filter`)}
              />
              <MenuItem
                icon={<Settings size={18} />}
                text={isSidebarOpen ? t("nav.settings") : ""}
                disabled={!isProfileActive}
                active={location.pathname.endsWith("/settings")}
                onClick={() => navigate(`/dash/${activeId}/settings`)}
              />
              <li className="my-4 border-t border-gray-100 dark:border-gray-800" />
              <MenuItem
                icon={<UserIcon size={18} />}
                text={isSidebarOpen ? t("common.account") : ""}
                active={location.pathname === "/account"}
                onClick={() => navigate("/account")}
              />
              <Popover
                position="right-bottom"
                content={
                  <div className="p-4 space-y-3">
                    <div className="font-bold text-sm">
                      {t("common.confirmLogout")}
                    </div>
                    <Button
                      fill
                      intent={Intent.DANGER}
                      text={t("common.logout")}
                      onClick={handleLogout}
                    />
                  </div>
                }
              >
                <MenuItem
                  icon={<LogOut size={18} />}
                  text={isSidebarOpen ? t("common.logout") : ""}
                  intent={Intent.DANGER}
                  shouldDismissPopover={false}
                />
              </Popover>
            </Menu>
          </div>
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <Button
              variant="minimal"
              icon={<MenuIcon size={18} />}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            />
            {isSidebarOpen && (
              <Tag minimal round>
                {currentUser?.username.toUpperCase() || "USER"}
              </Tag>
            )}
          </div>
        </aside>
      )}

      <main className="flex-1 min-w-0 h-full relative bg-gray-50/20 dark:bg-gray-950/20 flex flex-col overflow-hidden">
        {/* 顶部导航栏 */}
        <Navbar className="absolute! top-0 left-0 right-0 z-30 border-b! border-gray-200/50 dark:border-gray-800/50 shadow-none! bg-white/70! dark:bg-gray-900/70! backdrop-blur-lg! h-14 items-center px-4 shrink-0">
          <Navbar.Group align={Alignment.LEFT}>
            <button
              onClick={() => navigate("/dash")}
              className="font-bold text-blue-600 dark:text-blue-400 bg-transparent border-none p-0 cursor-pointer flex items-center gap-1"
            >
              <Icon icon="caret-left" />
              <span className="truncate max-w-30 md:max-w-none">
                {isProfileActive
                  ? selectedProfile?.name || t("common.loading")
                  : t("common.selectProfile")}
              </span>
            </button>
          </Navbar.Group>
          <Navbar.Group align={Alignment.RIGHT}>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <div className="flex items-center gap-1 bg-gray-100/50 dark:bg-gray-800/50 p-1 rounded-lg">
                <Button
                  variant="minimal"
                  icon={<Sun size={14} />}
                  size="small"
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                />
                <Button
                  variant="minimal"
                  icon={<Moon size={14} />}
                  size="small"
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                />
                <Button
                  variant="minimal"
                  icon={<Monitor size={14} />}
                  size="small"
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                />
              </div>
            </div>
          </Navbar.Group>
        </Navbar>

        {/* 页面内容 - 分情况处理滚动 */}
        <div className="flex-1 min-h-0 flex flex-col relative">
          {location.pathname.endsWith("/logs") ? (
            <div className="flex-1 overflow-y-auto">{children}</div>
          ) : (
            <div className="flex-1 overflow-y-auto pt-14">
              <div className="p-2 md:p-4 pb-24 md:pb-8">{children}</div>
            </div>
          )}
        </div>

        {/* 移动端底部导航 */}
        {isMobile && isProfileActive && (
          <div className="fixed bottom-0 left-0 right-0 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-800/50 flex items-center justify-around px-2 z-50 pb-safe">
            {navItems.map((item) => {
              const isActive = location.pathname.includes(
                item.id === "stats" ? "/stats" : `/${item.id}`,
              );
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className={clsx(
                    "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                    isActive ? "text-blue-500" : "text-gray-400",
                  )}
                >
                  {item.icon}
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => navigate("/account")}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                location.pathname === "/account"
                  ? "text-blue-500"
                  : "text-gray-400",
              )}
            >
              <UserIcon size={20} />
              <span className="text-[10px] font-medium">
                {t("common.account")}
              </span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [createError, setCreateError] = useState("");
  const [prefilledRule, setPrefilledRule] = useState<{
    domain: string;
    type: "ALLOW" | "BLOCK" | "REDIRECT";
    recordType?: string;
  } | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const toasterRef = useRef<OverlayToaster | null>(null);
  const { t } = useTranslation();

  // 动态网页标题
  useEffect(() => {
    const path = location.pathname;
    let moduleName = "";

    if (path === "/dash") moduleName = t("common.selectProfile");
    else if (path === "/account") moduleName = t("common.account");
    else if (path.endsWith("/setup")) moduleName = t("nav.setup");
    else if (path.endsWith("/filter")) moduleName = t("nav.filter");
    else if (path.endsWith("/rules")) moduleName = t("nav.rules");
    else if (path.endsWith("/settings")) moduleName = t("nav.settings");
    else if (path.endsWith("/stats")) moduleName = t("nav.stats");
    else if (path.endsWith("/logs")) moduleName = t("nav.logs");

    if (moduleName) {
      document.title = `${moduleName} | Obex DNS`;
    } else {
      document.title = "Obex DNS";
    }
  }, [location.pathname, t]);

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (t: "light" | "dark") => {
      root.classList.remove("light", "dark", "bp6-dark");
      root.classList.add(t);
      if (t === "dark") root.classList.add("bp6-dark");
    };
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      applyTheme(systemTheme);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  const checkAuthAndFetchData = async () => {
    try {
      const [profilesRes, meRes] = await Promise.all([
        fetch("/api/profiles"),
        fetch("/api/account/me"),
      ]);
      if (profilesRes.status === 401 || meRes.status === 401) {
        setIsLoggedIn(false);
        return;
      }
      if (profilesRes.ok && meRes.ok) {
        setProfiles(await profilesRes.json());
        setCurrentUser(await meRes.json());
        setIsLoggedIn(true);
      } else setIsLoggedIn(false);
    } catch (e) {
      setIsLoggedIn(false);
    }
  };

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const handleCreateProfile = async () => {
    if (!newProfileName) return;
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProfileName }),
      });
      if (res.ok) {
        setNewProfileName("");
        setShowCreateDialog(false);
        await checkAuthAndFetchData();
      } else setCreateError(await res.text());
    } catch (e) {
      setCreateError(t("common.errorNetwork"));
    }
  };

  const handleDeleteProfile = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
      if (res.ok) await checkAuthAndFetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setIsLoggedIn(false);
      setSelectedProfile(null);
      window.location.reload();
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleQuickAction = (
    domain: string,
    type: "ALLOW" | "BLOCK" | "REDIRECT",
    recordType?: string,
  ) => {
    setPrefilledRule({ domain, type, recordType });
    const profileId = selectedProfile?.id || location.pathname.split("/")[2];
    if (profileId) navigate(`/dash/${profileId}/rules`);
  };

  if (isLoggedIn === null)
    return (
      <div className="h-screen flex items-center justify-center">
        <GitHubCorner />
        <Spinner size={50} />
      </div>
    );
  if (!isLoggedIn)
    return (
      <>
        <GitHubCorner />
        <AuthView onSuccess={checkAuthAndFetchData} />
      </>
    );

  return (
    <>
      <GitHubCorner />
      <Routes>
        <Route path="/" element={<Navigate to="/dash" replace />} />
        <Route
          path="/dash"
          element={
            <DashboardHome
              profiles={profiles}
              onSelect={(p: Profile) => {
                setSelectedProfile(p);
                navigate(`/dash/${p.id}/setup`);
              }}
              onCreate={handleCreateProfile}
              showCreate={showCreateDialog}
              setShowCreate={setShowCreateDialog}
              newName={newProfileName}
              setNewName={setNewProfileName}
              error={createError}
              onDelete={handleDeleteProfile}
              handleLogout={handleLogout}
              navigate={navigate}
            />
          }
        />
        <Route
          path="/dash/:profileId/*"
          element={
            <MainLayout
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
              theme={theme}
              setTheme={setTheme}
              selectedProfile={selectedProfile}
              profiles={profiles}
              setSelectedProfile={setSelectedProfile}
              location={location}
              navigate={navigate}
              handleLogout={handleLogout}
              toasterRef={toasterRef}
              currentUser={currentUser}
            >
              <ProfileRoutes
                selectedProfile={selectedProfile}
                prefilledRule={prefilledRule}
                setPrefilledRule={setPrefilledRule}
                handleQuickAction={handleQuickAction}
                toasterRef={toasterRef}
              />
            </MainLayout>
          }
        />
        <Route
          path="/account"
          element={
            <MainLayout
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setIsSidebarOpen}
              theme={theme}
              setTheme={setTheme}
              selectedProfile={selectedProfile}
              profiles={profiles}
              setSelectedProfile={setSelectedProfile}
              location={location}
              navigate={navigate}
              handleLogout={handleLogout}
              toasterRef={toasterRef}
              currentUser={currentUser}
            >
              <AccountView />
            </MainLayout>
          }
        />
        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </>
  );
}

const NotFoundView = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="h-full flex items-center justify-center">
      <NonIdealState
        icon="search"
        title={t("common.notFound")}
        description={t("common.notFoundDesc")}
        action={
          <Button intent={Intent.PRIMARY} onClick={() => navigate("/dash")}>
            {t("common.backToHome")}
          </Button>
        }
      />
    </div>
  );
};

const ProfileRoutes = ({
  selectedProfile,
  prefilledRule,
  setPrefilledRule,
  handleQuickAction,
  toasterRef,
}: any) => {
  const { profileId } = useParams();
  const id = profileId || selectedProfile?.id || "";
  return (
    <Routes>
      <Route
        path="setup"
        element={<SetupView profileId={id} toasterRef={toasterRef} />}
      />
      <Route path="filter" element={<FilteringView profileId={id} />} />
      <Route
        path="rules"
        element={
          <RulesView
            profileId={id}
            prefill={prefilledRule}
            onPrefillUsed={() => setPrefilledRule(null)}
          />
        }
      />
      <Route
        path="settings"
        element={<SettingsView profileId={id} toasterRef={toasterRef} />}
      />
      <Route path="stats" element={<AnalyticsView profileId={id} />} />
      <Route
        path="logs"
        element={<LogsView profileId={id} onQuickAction={handleQuickAction} />}
      />
      <Route path="*" element={<NotFoundView />} />
    </Routes>
  );
};

export default App;
