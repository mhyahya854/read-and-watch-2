import { StaticProductPage } from '@/components/static-product-page';
import { SettingsManager } from '@/components/settings/settings-manager';

export default function SettingsPage() {
  return (
    <StaticProductPage title="Settings" eyebrow="Local application">
      <SettingsManager />
    </StaticProductPage>
  );
}
