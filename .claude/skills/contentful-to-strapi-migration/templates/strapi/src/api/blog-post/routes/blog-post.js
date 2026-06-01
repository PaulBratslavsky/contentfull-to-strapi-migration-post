'use strict';

/**
 * blog-post router
 *
 * find / findOne run through the default-populate middleware so the public API
 * returns author, category and coverImage without an explicit ?populate query.
 */

const { factories } = require('@strapi/strapi');

module.exports = factories.createCoreRouter('api::blog-post.blog-post', {
  config: {
    find: {
      middlewares: ['api::blog-post.default-populate'],
    },
    findOne: {
      middlewares: ['api::blog-post.default-populate'],
    },
  },
});
