import React, { useState, useEffect } from "react";
import { 
  Card, 
  Elevation, 
  FormGroup, 
  InputGroup, 
  Button, 
  H4,
  Intent,
  Tag,
  HTMLTable,
  Callout,
  Divider,
  Dialog,
  HTMLSelect,
  ButtonGroup,
  Switch
} from "@blueprintjs/core";
import { User, ShieldCheck, Trash2, UserPlus, Key, Edit2, Check, X, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface UserInfo {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at?: number;
}

export const AccountView: React.FC = () => {
  const [me, setMe] = useState<UserInfo | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  
  // 修改用户名状态
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);

  // 修改密码状态
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ text: string, intent: Intent } | null>(null);

  // 系统设置状态 (管理员专用)
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({});
  const [sysLoading, setSysLoading] = useState(false);

  // 创建用户弹窗状态
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [createLoading, setCreateLoading] = useState(false);

  const fetchMe = async () => {
    try {
      const res = await fetch("/api/account/me");
      if (res.ok) {
        const data = await res.json();
        setMe(data);
        setEditUsername(data.username);
        if (data.role === 'admin') {
          fetchUsers();
          fetchSystemSettings();
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) setSysSettings(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleUpdateUsername = async () => {
    if (editUsername === me?.username) {
      setIsEditingUsername(false);
      return;
    }
    if (!/^[a-zA-Z0-9]{5,15}$/.test(editUsername)) {
      alert(t("account.formatErrorUsername"));
      return;
    }
    setUsernameLoading(true);
    try {
      const res = await fetch("/api/account/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editUsername })
      });
      if (res.ok) {
        setMe(prev => prev ? { ...prev, username: editUsername } : null);
        setIsEditingUsername(false);
      } else {
        alert(await res.text());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
      setPwMessage({ text: t("account.formatErrorPassword"), intent: Intent.DANGER });
      return;
    }
    setPwLoading(true);
    setPwMessage(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      if (res.ok) {
        setPwMessage({ text: t("account.passwordSuccess"), intent: Intent.SUCCESS });
        setOldPassword("");
        setNewPassword("");
      } else {
        const msg = await res.text();
        setPwMessage({ text: msg || t("account.updateFailed"), intent: Intent.DANGER });
      }
    } catch (e) {
      setPwMessage({ text: t("common.errorNetwork"), intent: Intent.DANGER });
    } finally {
      setPwLoading(false);
    }
  };

  const handleSaveSysSettings = async () => {
    setSysLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sysSettings)
      });
      if (res.ok) {
        alert(t("common.saveSuccess", "设置已保存"));
      }
    } catch (e) { console.error(e); }
    finally { setSysLoading(false); }
  };

  const handleCreateUser = async () => {
    if (!/^[a-zA-Z0-9]{5,15}$/.test(newUsername)) {
      alert(t("account.formatErrorUsername"));
      return;
    }
    if (newUserPassword.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newUserPassword)) {
      alert(t("account.formatErrorPassword"));
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newUserPassword, role: newUserRole })
      });
      if (res.ok) {
        setIsDialogOpen(false);
        setNewUsername("");
        setNewUserPassword("");
        fetchUsers();
      } else {
        alert(await res.text());
      }
    } catch (e) { console.error(e); }
    finally { setCreateLoading(false); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm(t("account.confirmDeleteUser"))) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) fetchUsers();
    } catch (e) { console.error(e); }
  };

  const handleClearAllLogs = async () => {
    if (!confirm(t("account.confirmClearLogs"))) return;
    try {
      const res = await fetch("/api/account/logs", { method: "DELETE" });
      if (res.ok) {
        alert(t("account.clearLogsSuccess"));
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteMyAccount = async () => {
    if (!confirm(t("account.confirmDeleteAccount"))) return;
    try {
      const res = await fetch("/api/account/me", { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/";
      } else {
        alert(await res.text());
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchMe(); }, []);

  if (loading) return <div className="p-8 text-center">{t("common.loading")}</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="bp6-heading">{t("account.title")}</h2>
          <p className="bp6-text-muted">{t("account.subtitle")}</p>
        </div>
        {me && (
          <Tag large round intent={me.role === 'admin' ? Intent.DANGER : Intent.PRIMARY} icon={<ShieldCheck size={16}/>}>
            {me.role === 'admin' ? t("account.roleAdmin") : t("account.roleUser")}
          </Tag>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card elevation={Elevation.ONE}>
          <div className="flex items-center gap-2 mb-4">
            <User size={20} className="text-blue-500" />
            <H4 style={{margin: 0}}>{t("account.personalInfo")}</H4>
          </div>
          <div className="space-y-4">
            <FormGroup label={t("account.username")}>
              <div className="flex gap-2">
                {isEditingUsername ? (
                  <>
                    <InputGroup fill value={editUsername} onChange={e => setEditUsername(e.target.value)} autoFocus />
                    <ButtonGroup>
                      <Button icon={<Check size={16}/>} intent={Intent.SUCCESS} loading={usernameLoading} onClick={handleUpdateUsername} />
                      <Button icon={<X size={16}/>} onClick={() => { setIsEditingUsername(false); setEditUsername(me?.username || ""); }} />
                    </ButtonGroup>
                  </>
                ) : (
                  <>
                    <InputGroup fill value={me?.username} disabled />
                    <Button icon={<Edit2 size={16}/>} onClick={() => setIsEditingUsername(true)} />
                  </>
                )}
              </div>
            </FormGroup>
            <FormGroup label={t("account.userId")}>
              <InputGroup leftIcon="id-number" value={me?.id} disabled />
            </FormGroup>
          </div>
        </Card>

        <Card elevation={Elevation.ONE}>
          <div className="flex items-center gap-2 mb-4">
            <Key size={20} className="text-orange-500" />
            <H4 style={{margin: 0}}>{t("account.changePassword")}</H4>
          </div>
          {pwMessage && <Callout intent={pwMessage.intent} className="mb-4">{pwMessage.text}</Callout>}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <FormGroup label={t("account.currentPassword")}>
              <InputGroup leftIcon="lock" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required />
            </FormGroup>
            <FormGroup label={t("account.newPassword")}>
              <InputGroup leftIcon="lock" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            </FormGroup>
            <Button fill intent={Intent.WARNING} type="submit" loading={pwLoading} text={t("account.updatePassword")} />
          </form>
        </Card>
      </div>

      {me?.role === 'admin' && (
        <>
          <Divider />
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-red-500" />
                <H4 style={{margin: 0}}>{t("account.userManagement")}</H4>
              </div>
              <Button className="whitespace-nowrap" icon={<UserPlus size={16}/>} intent={Intent.SUCCESS} text={t("account.createUser")} onClick={() => setIsDialogOpen(true)} />
            </div>
            <Card elevation={Elevation.ONE} className="p-0 overflow-hidden overflow-x-auto">
              <HTMLTable interactive striped className="w-full">
                <thead>
                  <tr><th>{t("account.username")}</th><th>{t("account.role")}</th><th>ID</th><th>{t("account.createdAt")}</th><th className="text-right">{t("account.actions")}</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="font-bold">{u.username}</td>
                      <td><Tag minimal intent={u.role === 'admin' ? Intent.DANGER : Intent.NONE}>{u.role === 'admin' ? t("account.roleAdmin") : t("account.roleUser")}</Tag></td>
                      <td><code className="text-xs">{u.id}</code></td>
                      <td className="text-xs text-gray-500">{u.created_at ? new Date(u.created_at * 1000).toLocaleString() : '-'}</td>
                      <td className="text-right"><Button minimal intent={Intent.DANGER} icon={<Trash2 size={14}/>} disabled={u.id === me.id} onClick={() => handleDeleteUser(u.id)} /></td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            </Card>
          </div>

          <Divider />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-gray-500" />
              <H4 style={{margin: 0}}>{t("account.systemSettings", "系统设置")}</H4>
            </div>
            <Card elevation={Elevation.ONE}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-4">
                  <H4 className="text-sm font-bold opacity-70 text-blue-500">Cloudflare Turnstile</H4>
                  <FormGroup label="Site Key"><InputGroup value={sysSettings.turnstile_site_key || ""} onChange={e => setSysSettings({...sysSettings, turnstile_site_key: e.target.value})} placeholder="0x000..." /></FormGroup>
                  <FormGroup label="Secret Key"><InputGroup type="password" value={sysSettings.turnstile_secret_key || ""} onChange={e => setSysSettings({...sysSettings, turnstile_secret_key: e.target.value})} placeholder="0x000..." /></FormGroup>
                </div>
                <div className="space-y-4">
                  <H4 className="text-sm font-bold opacity-70 text-green-500">{t("account.featureToggle", "功能开关")}</H4>
                  <Switch label={t("account.enableTurnstileSignup", "注册页面启用验证")} checked={sysSettings.turnstile_enabled_signup === 'true'} onChange={e => setSysSettings({...sysSettings, turnstile_enabled_signup: String(e.currentTarget.checked)})} />
                  <Switch label={t("account.enableTurnstileLogin", "登录页面启用验证")} checked={sysSettings.turnstile_enabled_login === 'true'} onChange={e => setSysSettings({...sysSettings, turnstile_enabled_login: String(e.currentTarget.checked)})} />
                </div>
              </div>
              <Divider className="my-4" />
              <div className="flex justify-end"><Button intent={Intent.PRIMARY} icon="floppy-disk" text={t("common.save", "保存配置")} loading={sysLoading} onClick={handleSaveSysSettings} /></div>
            </Card>
          </div>
        </>
      )}

      <Divider />
      <div className="space-y-4">
        <H4 className="text-red-500 flex items-center gap-2"><Trash2 size={20} /> {t("account.dangerZone")}</H4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card elevation={Elevation.ONE}>
            <H4>{t("account.clearLogs")}</H4><p className="text-xs opacity-60 mb-4">{t("account.clearLogsDesc")}</p>
            <Button fill intent={Intent.DANGER} text={t("account.clearLogsBtn")} icon="trash" onClick={handleClearAllLogs} />
          </Card>
          {me?.role !== 'admin' && (
            <Card elevation={Elevation.ONE}>
              <H4>{t("account.deleteAccount")}</H4><p className="text-xs opacity-60 mb-4">{t("account.deleteAccountDesc")}</p>
              <Button fill intent={Intent.DANGER} text={t("account.deleteAccountBtn")} icon="delete" onClick={handleDeleteMyAccount} />
            </Card>
          )}
        </div>
        <Callout intent={Intent.WARNING} icon="info-sign" title={t("account.inactivityPolicy")}><p className="text-sm">{t("account.inactivityDesc")}</p></Callout>
      </div>

      <Dialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} title={t("account.createNewUser")} icon="user">
        <div className="p-6 space-y-4">
          <FormGroup label={t("account.username")}><InputGroup value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder={t("auth.usernamePlaceholder")} /></FormGroup>
          <FormGroup label={t("account.initialPassword")}><InputGroup type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} /></FormGroup>
          <FormGroup label={t("account.userRole")}><HTMLSelect fill value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)} options={[{ label: t("account.roleUser"), value: "user" }, { label: t("account.roleAdmin"), value: "admin" }]} /></FormGroup>
          <div className="flex justify-end gap-2 mt-6"><Button text={t("account.cancel")} onClick={() => setIsDialogOpen(false)} /><Button intent={Intent.PRIMARY} text={t("account.createNow")} loading={createLoading} onClick={handleCreateUser} /></div>
        </div>
      </Dialog>
    </div>
  );
};
