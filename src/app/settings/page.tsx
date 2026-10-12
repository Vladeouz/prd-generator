import { getSettings } from '../../template/settings.ts';
import { SettingsView } from './settings-view.tsx';

// Dibaca ulang setiap kali dibuka: isi template dan ketersediaan `claude` bisa berubah.
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  return <SettingsView settings={await getSettings()} />;
}
