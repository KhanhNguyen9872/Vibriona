import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
}

const SEO = ({
  title,
  description,
  keywords,
  image = '/og-image.png',
  url = window.location.href
}: SEOProps) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('seo.defaultTitle');
  const resolvedDescription = description ?? t('seo.defaultDescription');
  const resolvedKeywords = keywords ?? t('seo.defaultKeywords');
  const siteTitle = t('seo.siteName');

  return (
    <Helmet>
      {/* Standard metadata */}
      <title>{resolvedTitle}</title>
      <meta name='description' content={resolvedDescription} />
      <meta name='keywords' content={resolvedKeywords} />

      {/* Open Graph / Facebook */}
      <meta property='og:type' content='website' />
      <meta property='og:url' content={url} />
      <meta property='og:title' content={resolvedTitle} />
      <meta property='og:description' content={resolvedDescription} />
      <meta property='og:image' content={image} />
      <meta property='og:site_name' content={siteTitle} />

      {/* Twitter */}
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:url' content={url} />
      <meta name='twitter:title' content={resolvedTitle} />
      <meta name='twitter:description' content={resolvedDescription} />
      <meta name='twitter:image' content={image} />
    </Helmet>
  );
};

export default SEO;
