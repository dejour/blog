module.exports = {
  title: "Clay",
  theme: '@vuepress/blog',

  themeConfig: {
    summaryLength: 100,
    // Please keep looking down to see the available options.
    nav: [
      {
        text: 'Blog',
        link: '/',
      },
      {
        text: 'Tags',
        link: '/tag/',
      },
      {
        text: 'About',
        link: '/me/',
      },
      {
        text: 'Github',
        link: 'https://github.com/dejour/',
      },
    ],
    footer: {
      contact: [
        {
          type: 'github',
          link: 'https://github.com/dejour',
        },
        {
          type: 'twitter',
          link: 'https://twitter.com/dejour',
        },
      ],
      copyright: [
        {
          text: 'Powered by VuePress | Clay © 1994-present',
          link: '',
        },
      ],
    },
    
  }
}