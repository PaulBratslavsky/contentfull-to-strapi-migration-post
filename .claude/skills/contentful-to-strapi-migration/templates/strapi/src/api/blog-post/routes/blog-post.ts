import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::blog-post.blog-post', {
  config: {
    find: { middlewares: ['api::blog-post.default-populate'] },
    findOne: { middlewares: ['api::blog-post.default-populate'] },
  },
});
