import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const REPO_URL = 'https://github.com/iamkanguk97/mikro-orm-markdown';

export default defineConfig({
  site: 'https://iamkanguk97.github.io',
  base: '/mikro-orm-markdown',
  integrations: [
    starlight({
      title: 'mikro-orm-markdown',
      description: 'Mermaid ERD and Markdown schema docs generated from MikroORM entities.',
      logo: { light: './src/assets/mark.svg', dark: './src/assets/mark-dark.svg' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
      components: {
        Hero: './src/components/Hero.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        ThemeSelect: './src/components/ThemeToggle.astro',
      },
      editLink: { baseUrl: `${REPO_URL}/edit/main/website/` },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko' },
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { ko: '시작하기' },
          items: ['getting-started/overview', 'getting-started/installation', 'getting-started/quick-start'],
        },
        {
          label: 'Reference',
          translations: { ko: '레퍼런스' },
          items: ['reference/cli', 'reference/api', 'reference/jsdoc-tags'],
        },
        {
          label: 'Guides',
          translations: { ko: '가이드' },
          items: [
            'guides/schema-entities',
            'guides/cardinality',
            'guides/exclude-columns',
            'guides/compiled-js',
            'guides/sti',
            'guides/mermaid-options',
          ],
        },
        'troubleshooting',
        'examples',
      ],
      expressiveCode: {
        styleOverrides: { borderRadius: '0.375rem' },
      },
      customCss: [
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-sans-kr/400.css',
        '@fontsource/ibm-plex-sans-kr/500.css',
        '@fontsource/ibm-plex-sans-kr/600.css',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        './src/styles/custom.css',
      ],
    }),
  ],
});
