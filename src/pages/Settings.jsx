import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Moon, Bell, Globe, Shield, User, Palette, Save, Image } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const DEFAULT_PROFILE = { displayName: '', company: '', currency: 'USD', language: 'en' };
const DEFAULT_NOTIFICATIONS = { emailEstimates: true, emailReminders: true, browserAlerts: false };
const DEFAULT_LOGOS = { infoSignalLogo: '', dynaVentLogo: '' };

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [logoUrls, setLogoUrls] = useState(DEFAULT_LOGOS);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Populate state from saved user settings once user data arrives
  useEffect(() => {
    if (!user || loaded) return;
    const s = user.settings || {};
    setProfile({ ...DEFAULT_PROFILE, ...(s.profile || {}) });
    setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(s.notifications || {}) });
    setLogoUrls({ ...DEFAULT_LOGOS, ...(s.logoUrls || {}) });
    setLoaded(true);
  }, [user, loaded]);

  const persistSettings = async (overrides = {}) => {
    const payload = {
      settings: {
        profile,
        notifications,
        logoUrls,
        ...overrides,
      },
    };
    await base44.auth.updateMe(payload);
    queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistSettings();
      toast.success('Settings saved successfully');
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (logoType, file) => {
    if (!file) return;
    setUploadingLogo(logoType);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const updatedLogos = { ...logoUrls, [logoType]: file_url };
      setLogoUrls(updatedLogos);
      await persistSettings({ logoUrls: updatedLogos });
      toast.success('Logo uploaded and saved!');
    } catch (error) {
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your preferences and account configuration</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Appearance</CardTitle>
          </div>
          <CardDescription>Customize how InfoSignal looks for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark background</p>
            </div>
            <div className="flex items-center gap-3">
              <Sun className={`h-4 w-4 transition-colors ${!isDark ? 'text-primary' : 'text-muted-foreground'}`} />
              <Switch checked={isDark} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
              <Moon className={`h-4 w-4 transition-colors ${isDark ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`rounded-lg border-2 p-3 text-left transition-all ${!isDark ? 'border-primary' : 'border-border hover:border-muted-foreground'}`}
            >
              <div className="h-16 rounded bg-white border border-gray-200 mb-2 flex flex-col gap-1 p-2">
                <div className="h-2 w-12 rounded bg-gray-300" />
                <div className="h-2 w-8 rounded bg-orange-400" />
                <div className="h-2 w-10 rounded bg-gray-200 mt-1" />
              </div>
              <p className="text-xs font-medium">Light</p>
              <p className="text-xs text-muted-foreground">Clean white background</p>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`rounded-lg border-2 p-3 text-left transition-all ${isDark ? 'border-primary' : 'border-border hover:border-muted-foreground'}`}
            >
              <div className="h-16 rounded bg-[#1c1713] border border-[#2a2420] mb-2 flex flex-col gap-1 p-2">
                <div className="h-2 w-12 rounded bg-[#3a3330]" />
                <div className="h-2 w-8 rounded bg-orange-500" />
                <div className="h-2 w-10 rounded bg-[#2a2420] mt-1" />
              </div>
              <p className="text-xs font-medium">Dark</p>
              <p className="text-xs text-muted-foreground">Easy on the eyes</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Profile</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="opacity-60" />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input
                placeholder={user?.full_name || 'Your name'}
                value={profile.displayName}
                onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))}
              />
            </div>
            <div>
              <Label>Company</Label>
              <Input
                placeholder="Your company"
                value={profile.company}
                onChange={e => setProfile(p => ({ ...p, company: e.target.value }))}
              />
            </div>
            <div>
              <Label>Default Currency</Label>
              <Select value={profile.currency} onValueChange={v => setProfile(p => ({ ...p, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Logos */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Company Logos</CardTitle>
          </div>
          <CardDescription>Upload logos for estimate PDF headers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'infoSignalLogo', label: 'InfoSignal Logo', alt: 'InfoSignal' },
            { key: 'dynaVentLogo', label: 'DynaVent Logo', alt: 'DynaVent' },
          ].map(({ key, label, alt }) => (
            <div key={key}>
              <Label>{label}</Label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml"
                  onChange={e => handleLogoUpload(key, e.target.files[0])}
                  disabled={uploadingLogo === key}
                  className="text-xs"
                />
                {logoUrls[key] && (
                  <img src={logoUrls[key]} alt={alt} className="h-10 w-auto object-contain border rounded px-2 py-1 bg-white" />
                )}
                {uploadingLogo === key && (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Notifications</CardTitle>
          </div>
          <CardDescription>Choose what updates you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'emailEstimates', label: 'Estimate status updates', desc: 'Get notified when an estimate is accepted or declined' },
            { key: 'emailReminders', label: 'Expiry reminders', desc: 'Remind me 3 days before an estimate expires' },
            { key: 'browserAlerts', label: 'Browser notifications', desc: 'Show desktop notifications in the browser' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <Switch
                checked={notifications[key]}
                onCheckedChange={v => setNotifications(p => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Localization */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Localization</CardTitle>
          </div>
          <CardDescription>Language and regional preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label>Language</Label>
            <Select value={profile.language} onValueChange={v => setProfile(p => ({ ...p, language: v }))}>
              <SelectTrigger className="mt-1 w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Security</CardTitle>
          </div>
          <CardDescription>Manage your account security</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sign out of all sessions</p>
              <p className="text-xs text-muted-foreground mt-0.5">Log out from all devices</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => base44.auth.logout()}>Sign Out</Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="px-8">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}