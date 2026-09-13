import { StaticProductPage } from '@/components/static-product-page';

export default function PrivacyPage() {
  return (
    <StaticProductPage title="Privacy Policy" eyebrow="Interim product summary">
      <p>
        Read &amp; Watch is a local library application. Library metadata, notes,
        and reading files are stored on this computer in the configured local
        data folder.
      </p>
      <p>
        This version does not provide user accounts, cloud sync, sharing, or
        analytics. Opening a Read item may launch the installed local reader as
        a separate process.
      </p>
      <p>
        This page describes the current application behavior. A final legal
        policy requires review before distribution.
      </p>
    </StaticProductPage>
  );
}
