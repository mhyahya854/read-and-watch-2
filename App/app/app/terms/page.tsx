import { StaticProductPage } from '@/components/static-product-page';

export default function TermsPage() {
  return (
    <StaticProductPage
      title="Terms & Conditions"
      eyebrow="Interim product summary"
    >
      <p>
        Read &amp; Watch helps manage media and notes stored locally. You remain
        responsible for the files you add and for having the right to use them.
      </p>
      <p>
        The application does not promise cloud storage, synchronization,
        sharing, or account services. Keep your own verified backups of
        important data.
      </p>
      <p>
        These interim terms describe the current local application and are not
        a substitute for final legal review before distribution.
      </p>
    </StaticProductPage>
  );
}
