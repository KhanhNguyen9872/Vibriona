import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
}

const SEO = ({
  title = 'Vibriona - AI Presentation Generator',
  description = 'Generate professional presentations in seconds with AI. Simply describe your topic and get a complete slide deck.',
  keywords = 'AI presentation, slide generator, powerpoint AI, presentation maker',
  image = '/og-image.png',
  url = window.location.href
}: SEOProps) => {
  const siteTitle = 'Vibriona';

  return (
    <Helmet>
      {/* Standard metadata */}
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta name='keywords' content={keywords} />

      {/* Open Graph / Facebook */}
      <meta property='og:type' content='website' />
      <meta property='og:url' content={url} />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      <meta property='og:image' content={image} />
      <meta property='og:site_name' content={siteTitle} />

      {/* Twitter */}
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:url' content={url} />
      <meta name='twitter:title' content={title} />
      <meta name='twitter:description' content={description} />
      <meta name='twitter:image' content={image} />
    </Helmet>
  );
};

export default SEO;
