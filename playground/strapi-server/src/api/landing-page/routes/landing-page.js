'use strict';

/**
 * landing-page router
 *
 * find runs through default-populate so the single type returns its hero image
 * and featured posts without an explicit ?populate query.
 */

const { factories } = require('@strapi/strapi');

module.exports = factories.createCoreRouter('api::landing-page.landing-page', {
  config: {
    find: {
      middlewares: ['api::landing-page.default-populate'],
    },
  },
});
