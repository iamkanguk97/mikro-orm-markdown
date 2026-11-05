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
      logo: { src: './src/assets/mark.svg' },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: REPO_URL },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/mikro-orm-markdown' },
      ],
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
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
